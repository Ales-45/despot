import json
import concurrent.futures
import datetime
import shutil
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
BINARY = ROOT / ".local/bin/pocketbase"


class MultiplayerTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = tempfile.TemporaryDirectory(prefix="despot-tests-")
        hooks = getattr(cls, "hooks", ROOT / "pb_hooks")
        password = uuid.uuid4().hex
        subprocess.run(
            [str(BINARY), "superuser", "upsert", "admin@test.invalid", password,
             f"--dir={cls.data.name}", f"--hooksDir={hooks}",
             f"--migrationsDir={ROOT / 'pb_migrations'}"],
            cwd=ROOT, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        cls.base = f"http://127.0.0.1:{port}"
        cls.server = subprocess.Popen(
            [
                str(BINARY), "serve", f"--http=127.0.0.1:{port}",
                f"--dir={cls.data.name}", f"--hooksDir={hooks}",
                f"--migrationsDir={ROOT / 'pb_migrations'}",
                f"--publicDir={ROOT / 'pb_public'}", "--hooksWatch=false",
            ],
            cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
        )
        for _ in range(100):
            try:
                status, _ = cls.request("/api/health")
                if status == 200:
                    _, auth = cls.request("/api/collections/_superusers/auth-with-password", "POST", {
                        "identity": "admin@test.invalid", "password": password,
                    })
                    cls.admin = auth["token"]
                    return
            except urllib.error.URLError:
                time.sleep(0.1)
        cls.tearDownClass()
        raise RuntimeError("PocketBase test instance did not start")

    @classmethod
    def tearDownClass(cls):
        cls.server.terminate()
        cls.server.wait(timeout=10)
        cls.data.cleanup()

    @classmethod
    def request(cls, path, method="GET", body=None, token=None):
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = token
        data = None if body is None else json.dumps(body).encode()
        request = urllib.request.Request(cls.base + path, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(request, timeout=5) as response:
                return response.status, json.load(response)
        except urllib.error.HTTPError as error:
            return error.code, json.load(error)

    def user(self):
        email = f"{uuid.uuid4().hex}@test.invalid"
        password = "Test-password-123!"
        status, _ = self.request("/api/collections/users/records", "POST", {
            "email": email, "password": password, "passwordConfirm": password,
        })
        self.assertEqual(status, 200)
        status, auth = self.request("/api/collections/users/auth-with-password", "POST", {
            "identity": email, "password": password,
        })
        self.assertEqual(status, 200)
        return auth["record"]["id"], auth["token"]

    def post(self, action, body, token, expected=200):
        status, response = self.request(f"/api/despot/{action}", "POST", body, token)
        self.assertEqual(status, expected, response)
        return response

    def get(self, collection, record_id, token):
        status, response = self.request(f"/api/collections/{collection}/records/{record_id}", token=token)
        self.assertEqual(status, 200, response)
        return response

    def current_round(self, match_id, number, token, advance=True):
        path = f'/api/collections/rounds/records?filter=match_id%3D%22{match_id}%22%26%26round_number%3D{number}'
        status, response = self.request(path, token=token)
        self.assertEqual(status, 200, response)
        self.assertEqual(len(response["items"]), 1)
        round_record = response["items"][0]
        if advance and round_record.get("starts_at"):
            start = datetime.datetime.fromisoformat(round_record["starts_at"].replace("Z", "+00:00"))
            if start > datetime.datetime.now(datetime.timezone.utc):
                past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)).isoformat()
                with sqlite3.connect(Path(self.data.name) / "data.db") as db:
                    db.execute("UPDATE rounds SET starts_at = ? WHERE id = ?", (past, round_record["id"]))
                round_record["starts_at"] = past
        return round_record

    def setup_match(self):
        host, guest, outsider = self.user(), self.user(), self.user()
        match = self.post("create", {"is_private": True, "pin": "2468"}, host[1])
        match_id = match["id"]
        self.post("create", {"is_private": False}, host[1], 400)
        self.post("join", {"match_id": match_id, "pin": "wrong"}, guest[1], 403)
        self.post("join", {"match_id": match_id, "pin": "2468"}, guest[1])
        self.post("start", {"match_id": match_id}, guest[1], 403)
        self.post("start", {"match_id": match_id}, host[1])
        self.post("role", {"match_id": match_id, "choice": "ATT"}, host[1])
        self.post("role", {"match_id": match_id, "choice": "DEF"}, guest[1])
        return match_id, host, guest, outsider

    def test_secret_dice_rules_and_match_completion(self):
        match_id, attacker, defender, outsider = self.setup_match()
        round1 = self.current_round(match_id, 1, attacker[1])
        round_id = round1["id"]
        self.post("lock", {"round_id": round_id, "dice": [4, 4, 3], "side": "ATT"}, outsider[1], 403)
        self.post("lock", {"round_id": round_id, "dice": [6, 6, 6]}, attacker[1], 400)
        self.post("lock", {"round_id": round_id, "dice": [4, 4, 3]}, attacker[1])
        self.post("lock", {"round_id": round_id, "dice": [4, 4, 3]}, attacker[1], 400)
        self.assertEqual(self.post("my-lock", {"round_id": round_id}, attacker[1])["dice"], [4, 4, 3])
        self.assertIsNone(self.post("my-lock", {"round_id": round_id}, defender[1])["dice"])
        self.post("my-lock", {"round_id": round_id}, outsider[1], 403)
        opponent_view = self.get("rounds", round_id, defender[1])
        self.assertIsNone(opponent_view["att_dice"])
        self.assertIsNone(opponent_view["att_dice_initial"])
        status, _ = self.request("/api/collections/round_locks/records", token=defender[1])
        self.assertEqual(status, 403)
        status, _ = self.request(f"/api/collections/rounds/records/{round_id}", "PATCH", {"phase": "REVEALED"}, attacker[1])
        self.assertEqual(status, 403)
        self.post("lock", {"round_id": round_id, "dice": [4, 3, 3], "side": "ATT"}, defender[1])
        revealed = self.get("rounds", round_id, defender[1])
        self.assertEqual(revealed["phase"], "REVEALED")
        self.assertEqual(revealed["round_winner"], "ATT")
        self.assertEqual(revealed["att_dice_initial"], [4, 4, 3])

        match = self.get("matches", match_id, attacker[1])
        self.assertEqual((match["att_score"], match["def_score"], match["current_round"]), (1, 0, 2))
        self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], 1000)
        self.assertEqual(self.get("users", defender[0], defender[1])["elo"], 1000)

        round2 = self.current_round(match_id, 2, attacker[1])
        self.assertEqual((round2["att_constraint"], round2["def_constraint"]), ("ORDER", "ROUT"))
        self.post("lock", {"round_id": round2["id"], "dice": [6, 3, 2]}, attacker[1], 400)
        self.post("lock", {"round_id": round2["id"], "dice": [4, 4, 3]}, attacker[1])
        hint = self.get("rounds", round2["id"], defender[1])
        self.assertEqual(hint["ballesteros_hint"], "HIGHER_OR_EQUAL")
        self.assertIsNone(hint["att_dice"])
        self.post("lock", {"round_id": round2["id"], "dice": [5, 3, 2]}, defender[1])

        for _ in range(4):
            match = self.get("matches", match_id, attacker[1])
            if match["status"] == "FINISHED":
                break
            current = self.current_round(match_id, match["current_round"], attacker[1])
            att_dice = [4, 4, 3] if current["att_constraint"] == "ORDER" else [6, 3, 2]
            def_dice = [4, 3, 3] if current["def_constraint"] == "ORDER" else [5, 3, 2]
            self.post("lock", {"round_id": current["id"], "dice": att_dice}, attacker[1])
            self.post("lock", {"round_id": current["id"], "dice": def_dice}, defender[1])
        match = self.get("matches", match_id, attacker[1])
        self.assertEqual(match["status"], "FINISHED")
        self.assertIn(match["winner_id"], [attacker[0], defender[0]])
        winner = attacker if match["winner_id"] == attacker[0] else defender
        loser = defender if winner == attacker else attacker
        self.assertEqual(self.get("users", winner[0], winner[1])["elo"], 1016)
        self.assertEqual(self.get("users", loser[0], loser[1])["elo"], 984)

    def test_combat_special_cases(self):
        examples = [
            ([1, 5, 5], [2, 2, 6], "ATT", 2),
            ([1, 4, 6], [2, 3, 5], "ATT", 1),
            ([1, 1, 1], [4, 3, 3], "DEF", 1),
        ]
        for attack, defense, winner, points in examples:
            with self.subTest(attack=attack, defense=defense):
                match_id, attacker, defender, _ = self.setup_match()
                current = self.current_round(match_id, 1, attacker[1])
                self.post("lock", {"round_id": current["id"], "dice": attack}, attacker[1])
                self.post("lock", {"round_id": current["id"], "dice": defense}, defender[1])
                revealed = self.get("rounds", current["id"], attacker[1])
                self.assertEqual((revealed["round_winner"], revealed["points_awarded"]), (winner, points))
                if attack == [1, 5, 5]:
                    self.assertTrue(revealed["resolution_log"][0]["greekFire"])
                    self.assertEqual(revealed["att_dice"], [1, 5, 6])

    def test_pin_attempt_limit_and_timeout_before_deadline(self):
        host, guest = self.user(), self.user()
        self.assertLess(abs(self.post("clock", {}, host[1])["now"] - time.time() * 1000), 5000)
        match_id = self.post("create", {"is_private": True, "pin": "1234"}, host[1])["id"]
        for _ in range(5):
            result = self.post("join", {"match_id": match_id, "pin": "9999"}, guest[1], 403)
            self.assertEqual(result["message"], "Incorrect PIN.")
        result = self.post("join", {"match_id": match_id, "pin": "1234"}, guest[1], 429)
        self.assertEqual(result["message"], "Too many attempts. Wait one minute.")
        self.assertEqual(self.get("matches", match_id, host[1])["player_2"], "")

        match_id, host, guest, _ = self.setup_match()
        current = self.current_round(match_id, 1, host[1])
        result = self.post("timeout", {"round_id": current["id"]}, guest[1])
        self.assertTrue(result["pending"])
        self.assertEqual(self.get("rounds", current["id"], host[1])["phase"], "LOCKING")

    def test_clients_cannot_forge_elo_or_create_match_records(self):
        email = f"{uuid.uuid4().hex}@test.invalid"
        password = "Test-password-123!"
        status, user = self.request("/api/collections/users/records", "POST", {
            "email": email, "password": password, "passwordConfirm": password, "elo": 2000,
        })
        self.assertEqual(status, 200, user)
        self.assertEqual(user["elo"], 1000)
        _, auth = self.request("/api/collections/users/auth-with-password", "POST", {
            "identity": email, "password": password,
        })
        status, _ = self.request(f"/api/collections/users/records/{user['id']}", "PATCH", {"elo": 2000}, auth["token"])
        self.assertEqual(status, 403)
        status, _ = self.request("/api/collections/matches/records", "POST", {
            "room_code": "CHEAT", "player_1": user["id"], "status": "PLAYING",
            "p1_role_choice": "ATT", "p2_role_choice": "DEF", "current_round": 1,
        }, auth["token"])
        self.assertEqual(status, 403)
        status, edited = self.request(f"/api/collections/users/records/{user['id']}", "PATCH", {"elo": 1200}, self.admin)
        self.assertEqual(status, 200, edited)
        self.assertEqual(edited["elo"], 1200)

    def test_elo_unequal_ratings_and_no_double_update(self):
        for winner_elo, loser_elo, change in [(1200, 1000, 8), (1000, 1200, 24), (1000, 0, 0)]:
            with self.subTest(winner_elo=winner_elo, loser_elo=loser_elo):
                match_id, attacker, defender, _ = self.setup_match()
                for player, rating in [(attacker, winner_elo), (defender, loser_elo)]:
                    status, response = self.request(
                        f"/api/collections/users/records/{player[0]}", "PATCH", {"elo": rating}, self.admin)
                    self.assertEqual(status, 200, response)
                status, response = self.request(
                    f"/api/collections/matches/records/{match_id}", "PATCH", {"att_score": 2}, self.admin)
                self.assertEqual(status, 200, response)
                current = self.current_round(match_id, 1, attacker[1])
                self.post("lock", {"round_id": current["id"], "dice": [4, 4, 3]}, attacker[1])
                self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], winner_elo)
                self.post("lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1])
                self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], winner_elo + change)
                self.assertEqual(self.get("users", defender[0], defender[1])["elo"], loser_elo - change)
                self.post("timeout", {"round_id": current["id"]}, attacker[1], 400)
                self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], winner_elo + change)
                self.assertEqual(self.get("users", defender[0], defender[1])["elo"], loser_elo - change)
                next_match = self.post("create", {}, attacker[1])["id"]
                self.assertEqual(self.get("matches", next_match, attacker[1])["host_elo"], winner_elo + change)

    def test_simultaneous_final_locks_update_elo_once(self):
        match_id, attacker, defender, _ = self.setup_match()
        status, response = self.request(
            f"/api/collections/matches/records/{match_id}", "PATCH", {"att_score": 2}, self.admin)
        self.assertEqual(status, 200, response)
        current = self.current_round(match_id, 1, attacker[1])
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            requests = [
                pool.submit(self.post, "lock", {"round_id": current["id"], "dice": [4, 4, 3]}, attacker[1]),
                pool.submit(self.post, "lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1]),
            ]
            for request in requests:
                request.result()
        self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], 1016)
        self.assertEqual(self.get("users", defender[0], defender[1])["elo"], 984)

    def test_all_reachable_multiplayer_score_paths(self):
        examples = {
            ("FREE", "FREE"): {
                ("ATT", 1): ([1, 1, 6], [1, 5, 1]), ("ATT", 2): ([1, 2, 5], [3, 1, 6]),
                ("DEF", 1): ([1, 1, 6], [1, 3, 6]), ("DEF", 2): ([1, 1, 6], [1, 1, 5]),
            },
            ("ORDER", "ROUT"): {
                ("ATT", 1): ([1, 1, 6], [2, 4, 1]), ("ATT", 2): ([1, 5, 5], [1, 3, 6]),
                ("DEF", 1): ([1, 1, 6], [1, 3, 6]), ("DEF", 2): ([1, 1, 6], [1, 2, 4]),
            },
            ("ROUT", "ORDER"): {
                ("ATT", 1): ([1, 2, 5], [1, 1, 5]), ("ATT", 2): ([1, 3, 4], [2, 2, 6]),
                ("DEF", 1): ([1, 2, 5], [1, 3, 3]), ("DEF", 2): ([1, 2, 5], [4, 4, 2]),
            },
        }
        paths = []

        def enumerate_paths(att, defense, path):
            if att == 3 or defense == 3:
                paths.append(path)
                return
            for side in ("ATT", "DEF"):
                for points in (1, 2):
                    enumerate_paths(min(3, att + (points if side == "ATT" else 0)),
                                    min(3, defense + (points if side == "DEF" else 0)),
                                    path + [(side, points)])

        enumerate_paths(0, 0, [])
        self.assertEqual(len(paths), 100)

        with tempfile.TemporaryDirectory(prefix="despot-sequences-") as directory:
            root = Path(directory)
            hooks = root / "pb_hooks"
            shutil.copytree(ROOT / "pb_hooks", hooks)
            (root / "pb_public").symlink_to(ROOT / "pb_public", target_is_directory=True)
            source = hooks / "multiplayer.js"
            original = source.read_text()
            random_roll = '() => Number($security.randomStringWithAlphabet(1, "123456"))'
            self.assertEqual(original.count(random_roll), 1)
            source.write_text(original.replace(random_roll, "() => 1"))

            class FixedRollFixture(MultiplayerTest):
                pass

            FixedRollFixture.hooks = hooks
            FixedRollFixture.setUpClass()
            fixture = FixedRollFixture()
            try:
                players = [fixture.user(), fixture.user()]
                for path_index, path in enumerate(paths):
                    with self.subTest(path=path):
                        host, guest = players if path_index % 2 == 0 else players[::-1]
                        attacker, defender = (host, guest) if path_index % 4 < 2 else (guest, host)
                        private = path_index % 2 == 0
                        match_id = fixture.post("create", {"is_private": private, "pin": "2468"}, host[1])["id"]
                        fixture.post("join", {"match_id": match_id, "pin": "2468"}, guest[1])
                        fixture.post("start", {"match_id": match_id}, host[1])
                        fixture.post("role", {"match_id": match_id, "choice": "ATT"}, attacker[1])
                        fixture.post("role", {"match_id": match_id, "choice": "DEF"}, defender[1])
                        score = {"ATT": 0, "DEF": 0}
                        constraints = ("FREE", "FREE")
                        for number, (winner, points) in enumerate(path, 1):
                            current = fixture.current_round(match_id, number, attacker[1])
                            self.assertEqual((current["att_constraint"], current["def_constraint"]), constraints)
                            att_dice, def_dice = examples[constraints][(winner, points)]
                            locks = [(attacker, att_dice), (defender, def_dice)]
                            if (number + path_index) % 2:
                                locks.reverse()
                            for player, dice in locks:
                                fixture.post("lock", {"round_id": current["id"], "dice": dice}, player[1])
                            revealed = fixture.get("rounds", current["id"], attacker[1])
                            self.assertEqual((revealed["round_winner"], revealed["points_awarded"]), (winner, points))
                            score[winner] = min(3, score[winner] + points)
                            match = fixture.get("matches", match_id, defender[1])
                            self.assertEqual((match["att_score"], match["def_score"]), (score["ATT"], score["DEF"]))
                            if number == len(path):
                                self.assertEqual(match["status"], "FINISHED")
                                self.assertEqual(match["winner_id"], attacker[0] if winner == "ATT" else defender[0])
                            else:
                                self.assertEqual((match["status"], match["current_round"]), ("PLAYING", number + 1))
                                constraints = ("ORDER", "ROUT") if winner == "ATT" else ("ROUT", "ORDER")
                        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=6)).isoformat()
                        with sqlite3.connect(Path(FixedRollFixture.data.name) / "data.db") as db:
                            db.execute("UPDATE matches SET finished_at = ? WHERE id = ?", (past, match_id))
            finally:
                FixedRollFixture.tearDownClass()

    def test_defender_receives_elo_when_winning(self):
        match_id, attacker, defender, _ = self.setup_match()
        status, response = self.request(
            f"/api/collections/matches/records/{match_id}", "PATCH", {"def_score": 2}, self.admin)
        self.assertEqual(status, 200, response)
        current = self.current_round(match_id, 1, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [1, 1, 1]}, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1])
        self.assertEqual(self.get("matches", match_id, attacker[1])["winner_id"], defender[0])
        self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], 984)
        self.assertEqual(self.get("users", defender[0], defender[1])["elo"], 1016)

    def test_only_first_finished_match_per_pair_and_utc_day_is_rated(self):
        first, second = self.user(), self.user()

        def finish(host, guest, private):
            match_id = self.post("create", {"is_private": private, "pin": "2468"}, host[1])["id"]
            self.post("join", {"match_id": match_id, "pin": "2468"}, guest[1])
            self.post("start", {"match_id": match_id}, host[1])
            self.post("role", {"match_id": match_id, "choice": "ATT"}, host[1])
            self.post("role", {"match_id": match_id, "choice": "DEF"}, guest[1])
            status, response = self.request(
                f"/api/collections/matches/records/{match_id}", "PATCH", {"att_score": 2}, self.admin)
            self.assertEqual(status, 200, response)
            round_record = self.current_round(match_id, 1, host[1])
            self.post("lock", {"round_id": round_record["id"], "dice": [4, 4, 3]}, host[1])
            self.post("lock", {"round_id": round_record["id"], "dice": [4, 3, 3]}, guest[1])
            return self.get("matches", match_id, host[1])

        match = finish(first, second, True)
        self.assertFalse(match["elo_unrated"])
        self.assertEqual(self.get("users", first[0], first[1])["elo"], 1016)
        self.assertEqual(self.get("users", second[0], second[1])["elo"], 984)
        self.assertEqual(self.request("/api/collections/rated_pairs/records", token=first[1])[0], 403)

        match = finish(second, first, False)
        self.assertTrue(match["elo_unrated"])
        self.assertEqual(self.get("users", first[0], first[1])["elo"], 1016)
        self.assertEqual(self.get("users", second[0], second[1])["elo"], 984)

        yesterday = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(days=1)).date().isoformat()
        with sqlite3.connect(Path(self.data.name) / "data.db") as db:
            db.execute("UPDATE rated_pairs SET day = ? WHERE player_a = ? AND player_b = ?",
                       (yesterday, *sorted([first[0], second[0]])))
        match = finish(second, first, False)
        self.assertFalse(match["elo_unrated"])
        self.assertLess(self.get("users", first[0], first[1])["elo"], 1016)
        self.assertGreater(self.get("users", second[0], second[1])["elo"], 984)
        with sqlite3.connect(Path(self.data.name) / "data.db") as db:
            dates = db.execute("SELECT day FROM rated_pairs WHERE player_a = ? AND player_b = ?",
                               sorted([first[0], second[0]])).fetchall()
        self.assertEqual(dates, [(datetime.datetime.now(datetime.timezone.utc).date().isoformat(),)])

    def test_canceled_room_does_not_consume_daily_rating(self):
        host, guest = self.user(), self.user()
        match_id = self.post("create", {}, host[1])["id"]
        self.post("join", {"match_id": match_id}, guest[1])
        request = urllib.request.Request(
            self.base + f"/api/collections/matches/records/{match_id}",
            headers={"Authorization": host[1]}, method="DELETE")
        with urllib.request.urlopen(request, timeout=5) as response:
            self.assertEqual(response.status, 204)
        with sqlite3.connect(Path(self.data.name) / "data.db") as db:
            count = db.execute("SELECT COUNT(*) FROM rated_pairs WHERE player_a = ? AND player_b = ?",
                               sorted([host[0], guest[0]])).fetchone()[0]
        self.assertEqual(count, 0)

    def test_existing_ratings_are_reset_by_migration(self):
        host, guest = self.user(), self.user()
        match_id = self.post("create", {}, host[1])["id"]
        self.post("join", {"match_id": match_id}, guest[1])
        with tempfile.TemporaryDirectory(prefix="despot-migration-") as directory:
            data_file = Path(directory) / "data.db"
            with sqlite3.connect(Path(self.data.name) / "data.db") as source, sqlite3.connect(data_file) as target:
                source.backup(target)
            migration_command = [
                str(BINARY), "migrate", f"--dir={directory}",
                f"--hooksDir={ROOT / 'pb_hooks'}", f"--migrationsDir={ROOT / 'pb_migrations'}",
            ]
            with sqlite3.connect(data_file) as db:
                db.execute("DELETE FROM _migrations WHERE file = ?", ("1795128474_initialize_elo.js",))
                db.execute("UPDATE users SET elo = 1600 WHERE id = ?", (host[0],))
                db.execute("UPDATE users SET elo = 0 WHERE id = ?", (guest[0],))
                db.execute("UPDATE matches SET host_elo = 1600, guest_elo = 0 WHERE id = ?", (match_id,))
            subprocess.run(migration_command + ["up"], cwd=ROOT, check=True, capture_output=True)
            with sqlite3.connect(data_file) as db:
                ratings = dict(db.execute("SELECT id, elo FROM users WHERE id IN (?, ?)", (host[0], guest[0])))
                snapshot = db.execute("SELECT host_elo, guest_elo FROM matches WHERE id = ?", (match_id,)).fetchone()
            self.assertEqual(ratings, {host[0]: 1000, guest[0]: 1000})
            self.assertEqual(snapshot, (1000, 1000))

    def test_waiting_match_shows_host_snapshot_without_exposing_email(self):
        host, guest = self.user(), self.user()
        status, response = self.request(f"/api/collections/users/records/{host[0]}", "PATCH", {
            "username": "Anfitrion", "profile_avatar": "assets/profile/prof02.svg",
        }, host[1])
        self.assertEqual(status, 200, response)
        match_id = self.post("create", {}, host[1])["id"]
        status, response = self.request(
            '/api/collections/matches/records?filter=status%3D%22WAITING%22', token=guest[1])
        self.assertEqual(status, 200, response)
        match = next(record for record in response["items"] if record["id"] == match_id)
        self.assertEqual((match["host_name"], match["host_avatar"], match["host_elo"]),
                         ("Anfitrion", "assets/profile/prof02.svg", 1000))
        self.assertNotIn("email", match)
        self.assertEqual(self.request(f"/api/collections/users/records/{host[0]}", token=guest[1])[0], 404)

    def test_defender_win_applies_constraints_and_ballesteros(self):
        match_id, attacker, defender, _ = self.setup_match()
        first = self.current_round(match_id, 1, attacker[1])
        self.post("lock", {"round_id": first["id"], "dice": [1, 1, 1]}, attacker[1])
        self.post("lock", {"round_id": first["id"], "dice": [4, 3, 3]}, defender[1])
        second = self.current_round(match_id, 2, attacker[1])
        self.assertEqual((second["att_constraint"], second["def_constraint"]), ("ROUT", "ORDER"))
        self.post("lock", {"round_id": second["id"], "dice": [4, 4, 2]}, attacker[1], 400)
        self.post("lock", {"round_id": second["id"], "dice": [5, 3, 2]}, defender[1], 400)
        self.post("lock", {"round_id": second["id"], "dice": [5, 2, 2]}, defender[1])
        self.assertEqual(self.get("rounds", second["id"], attacker[1])["ballesteros_hint"], "HIGHER_OR_EQUAL")

    def test_role_selection_with_matching_choices_assigns_opposite_roles(self):
        for choice in ("ATT", "DEF"):
            with self.subTest(choice=choice):
                host, guest, outsider = self.user(), self.user(), self.user()
                match_id = self.post("create", {}, host[1])["id"]
                self.post("join", {"match_id": match_id}, guest[1])
                self.post("role", {"match_id": match_id, "choice": choice}, host[1], 400)
                self.post("start", {"match_id": match_id}, host[1])
                self.post("role", {"match_id": match_id, "choice": choice}, outsider[1], 403)
                self.post("role", {"match_id": match_id, "choice": choice}, host[1])
                self.post("role", {"match_id": match_id, "choice": choice}, host[1], 400)
                self.post("role", {"match_id": match_id, "choice": choice}, guest[1])
                match = self.get("matches", match_id, host[1])
                self.assertEqual(match["status"], "PLAYING")
                self.assertEqual({match["attacker_id"], match["defender_id"]}, {host[0], guest[0]})
                current = self.current_round(match_id, 1, host[1])
                self.assertEqual((current["att_constraint"], current["def_constraint"]), ("FREE", "FREE"))

    def test_draw_attempts_reset_locks_and_retry_same_round(self):
        match_id, attacker, defender, _ = self.setup_match()
        current = self.current_round(match_id, 1, attacker[1])
        for player in (attacker, defender):
            self.post("lock", {"round_id": current["id"], "dice": [1, 1, 1]}, player[1])
        retried = self.get("rounds", current["id"], attacker[1])
        self.assertEqual((retried["phase"], retried["attempt"], retried["first_locker"],
                          retried["ballesteros_hint"]), ("LOCKING", 1, "NONE", "NONE"))
        self.assertIsNone(self.post("my-lock", {"round_id": current["id"]}, attacker[1])["dice"])
        self.assertIsNone(self.post("my-lock", {"round_id": current["id"]}, defender[1])["dice"])
        match = self.get("matches", match_id, attacker[1])
        self.assertEqual((match["current_round"], match["att_score"], match["def_score"]), (1, 0, 0))
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)).isoformat()
        with sqlite3.connect(Path(self.data.name) / "data.db") as db:
            db.execute("UPDATE rounds SET ends_at = ? WHERE id = ?", (past, current["id"]))
        self.post("timeout", {"round_id": current["id"]}, defender[1])
        retried = self.get("rounds", current["id"], defender[1])
        self.assertEqual((retried["phase"], retried["attempt"], retried["first_locker"]), ("LOCKING", 2, "NONE"))
        self.post("lock", {"round_id": current["id"], "dice": [4, 4, 3]}, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1])
        self.assertEqual(self.get("matches", match_id, attacker[1])["current_round"], 2)

    def test_ballesteros_lower_and_deadline(self):
        match_id, attacker, defender, _ = self.setup_match()
        first = self.current_round(match_id, 1, attacker[1])
        self.post("lock", {"round_id": first["id"], "dice": [4, 4, 3]}, attacker[1])
        self.post("lock", {"round_id": first["id"], "dice": [4, 3, 3]}, defender[1])
        second = self.current_round(match_id, 2, attacker[1])
        self.post("lock", {"round_id": second["id"], "dice": [3, 3, 5]}, attacker[1])
        updated = self.get("rounds", second["id"], defender[1])
        self.assertEqual(updated["ballesteros_hint"], "LOWER")
        original_end = datetime.datetime.fromisoformat(second["ends_at"].replace("Z", "+00:00"))
        shortened_end = datetime.datetime.fromisoformat(updated["ends_at"].replace("Z", "+00:00"))
        self.assertEqual((original_end - shortened_end).total_seconds(), 10)

        host, guest = self.user(), self.user()
        status, match = self.request("/api/collections/matches/records", "POST", {
            "room_code": uuid.uuid4().hex[:8].upper(), "player_1": host[0], "player_2": guest[0],
            "attacker_id": host[0], "defender_id": guest[0], "status": "PLAYING",
            "p1_role_choice": "ATT", "p2_role_choice": "DEF", "current_round": 2,
        }, self.admin)
        self.assertEqual(status, 200, match)
        deadline = (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(seconds=5)).isoformat()
        status, current = self.request("/api/collections/rounds/records", "POST", {
            "match_id": match["id"], "round_number": 2, "phase": "LOCKING", "ends_at": deadline,
            "att_constraint": "FREE", "def_constraint": "FREE", "first_locker": "NONE",
            "ballesteros_hint": "NONE",
        }, self.admin)
        self.assertEqual(status, 200, current)
        status, response = self.request("/api/collections/round_locks/records", "POST", {
            "round": current["id"],
        }, self.admin)
        self.assertEqual(status, 200, response)
        result = self.post("lock", {"round_id": current["id"], "dice": [4, 4, 3]}, host[1])
        self.assertTrue(result["resolved"])
        outcome = self.get("rounds", current["id"], host[1])
        self.assertEqual((outcome["phase"], outcome["round_winner"], outcome["ballesteros_hint"]),
                         ("REVEALED", "ATT", "NONE"))

    def test_expired_timeout_and_concurrent_locks(self):
        host, guest = self.user(), self.user()
        status, match = self.request("/api/collections/matches/records", "POST", {
            "room_code": uuid.uuid4().hex[:8].upper(), "player_1": host[0], "player_2": guest[0],
            "attacker_id": host[0], "defender_id": guest[0], "status": "PLAYING",
            "p1_role_choice": "ATT", "p2_role_choice": "DEF", "current_round": 1,
        }, self.admin)
        self.assertEqual(status, 200, match)
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(seconds=1)).isoformat()
        status, round1 = self.request("/api/collections/rounds/records", "POST", {
            "match_id": match["id"], "round_number": 1, "phase": "LOCKING", "ends_at": past,
            "att_constraint": "FREE", "def_constraint": "FREE", "first_locker": "ATT",
            "ballesteros_hint": "NONE",
        }, self.admin)
        self.assertEqual(status, 200, round1)
        status, response = self.request("/api/collections/round_locks/records", "POST", {
            "round": round1["id"], "att_dice": "[4,4,3]",
        }, self.admin)
        self.assertEqual(status, 200, response)
        self.post("lock", {"round_id": round1["id"], "dice": [4, 3, 3]}, guest[1], 400)
        self.post("timeout", {"round_id": round1["id"]}, guest[1])
        revealed = self.get("rounds", round1["id"], guest[1])
        self.assertEqual((revealed["phase"], revealed["round_winner"]), ("REVEALED", "ATT"))
        match = self.get("matches", match["id"], host[1])
        self.assertEqual((match["att_score"], match["current_round"]), (1, 2))
        self.post("timeout", {"round_id": round1["id"]}, guest[1], 400)

        match_id, attacker, defender, _ = self.setup_match()
        current = self.current_round(match_id, 1, attacker[1])
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            requests = [
                pool.submit(self.post, "lock", {"round_id": current["id"], "dice": [4, 4, 3]}, attacker[1]),
                pool.submit(self.post, "lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1]),
            ]
            for request in requests:
                request.result()
        match = self.get("matches", match_id, attacker[1])
        self.assertEqual((match["att_score"], match["def_score"], match["current_round"]), (1, 0, 2))

    def test_round_history_is_private_and_finished_matches_are_archived(self):
        match_id, attacker, defender, outsider = self.setup_match()
        current = self.current_round(match_id, 1, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [4, 4, 3]}, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1])

        def history(token):
            status, records = self.request("/api/collections/round_history/records", token=token)
            self.assertEqual(status, 200, records)
            return records["items"]

        att_history, def_history = history(attacker[1]), history(defender[1])
        self.assertEqual([(r["round_number"], r["result"], r["points"]) for r in att_history], [(1, "WIN", 1)])
        self.assertEqual([(r["round_number"], r["result"], r["points"]) for r in def_history], [(1, "LOSS", 0)])
        self.assertEqual(history(outsider[1]), [])
        status, _ = self.request(f'/api/collections/round_history/records/{att_history[0]["id"]}', token=defender[1])
        self.assertEqual(status, 404)
        status, _ = self.request("/api/collections/round_history/records", "POST", att_history[0], attacker[1])
        self.assertEqual(status, 403)

        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=6)).isoformat()
        status, match = self.request(f"/api/collections/matches/records/{match_id}", "PATCH",
                                     {"status": "FINISHED", "finished_at": past}, self.admin)
        self.assertEqual(status, 200, match)
        self.post("create", {}, attacker[1])
        self.assertEqual(self.request(f"/api/collections/matches/records/{match_id}", token=self.admin)[0], 404)
        self.assertEqual(self.request(f"/api/collections/rounds/records/{current['id']}", token=self.admin)[0], 404)
        self.assertEqual(len(history(attacker[1])), 1)
        self.assertEqual(len(history(defender[1])), 1)

    def test_only_started_inactive_matches_expire(self):
        match_id, attacker, defender, _ = self.setup_match()
        current = self.current_round(match_id, 1, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [4, 4, 3]}, attacker[1])
        self.post("lock", {"round_id": current["id"], "dice": [4, 3, 3]}, defender[1])
        self.post("create", {}, attacker[1], 400)
        self.assertEqual(self.get("matches", match_id, attacker[1])["status"], "PLAYING")
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=6)).isoformat()
        status, response = self.request(f"/api/collections/matches/records/{match_id}", "PATCH",
                                        {"last_activity": past}, self.admin)
        self.assertEqual(status, 200, response)
        new_match = self.post("create", {}, attacker[1])
        self.assertEqual(self.request(f"/api/collections/matches/records/{match_id}", token=self.admin)[0], 404)
        self.assertEqual(self.get("users", attacker[0], attacker[1])["elo"], 1000)
        self.assertEqual(self.get("users", defender[0], defender[1])["elo"], 1000)
        status, records = self.request("/api/collections/round_history/records", token=defender[1])
        self.assertEqual(status, 200, records)
        self.assertEqual(len(records["items"]), 1)

        status, response = self.request(f"/api/collections/matches/records/{new_match['id']}", "PATCH",
                                        {"last_activity": past}, self.admin)
        self.assertEqual(status, 200, response)
        self.post("create", {}, attacker[1], 400)
        self.assertEqual(self.get("matches", new_match["id"], attacker[1])["status"], "WAITING")

    def test_existing_finished_match_is_archived_before_removal(self):
        attacker, defender = self.user(), self.user()
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=6)).isoformat()
        status, match = self.request("/api/collections/matches/records", "POST", {
            "room_code": uuid.uuid4().hex[:8].upper(), "player_1": attacker[0], "player_2": defender[0],
            "attacker_id": attacker[0], "defender_id": defender[0], "winner_id": attacker[0],
            "status": "FINISHED", "finished_at": past, "p1_role_choice": "ATT", "p2_role_choice": "DEF",
            "current_round": 1,
        }, self.admin)
        self.assertEqual(status, 200, match)
        status, round1 = self.request("/api/collections/rounds/records", "POST", {
            "match_id": match["id"], "round_number": 1, "phase": "REVEALED", "ends_at": past,
            "att_constraint": "FREE", "def_constraint": "FREE", "first_locker": "ATT",
            "ballesteros_hint": "NONE", "round_winner": "ATT", "points_awarded": 2,
        }, self.admin)
        self.assertEqual(status, 200, round1)
        self.post("create", {}, attacker[1])
        self.assertEqual(self.request(f'/api/collections/matches/records/{match["id"]}', token=self.admin)[0], 404)
        status, records = self.request("/api/collections/round_history/records", token=attacker[1])
        self.assertEqual(status, 200, records)
        self.assertEqual([(r["result"], r["points"]) for r in records["items"]], [("WIN", 2)])

    def test_round_pause_is_server_enforced(self):
        match_id, attacker, defender, _ = self.setup_match()
        first = self.current_round(match_id, 1, attacker[1])
        self.post("lock", {"round_id": first["id"], "dice": [4, 4, 3]}, attacker[1])
        self.post("lock", {"round_id": first["id"], "dice": [4, 3, 3]}, defender[1])
        second = self.current_round(match_id, 2, attacker[1], advance=False)
        starts = datetime.datetime.fromisoformat(second["starts_at"].replace("Z", "+00:00"))
        ends = datetime.datetime.fromisoformat(second["ends_at"].replace("Z", "+00:00"))
        now = datetime.datetime.now(datetime.timezone.utc)
        self.assertGreater((starts - now).total_seconds(), 8)
        self.assertEqual((ends - starts).total_seconds(), 20)
        self.post("lock", {"round_id": second["id"], "dice": [4, 4, 3]}, attacker[1], 400)
        self.assertTrue(self.post("timeout", {"round_id": second["id"]}, defender[1])["pending"])
        self.current_round(match_id, 2, attacker[1])
        self.post("lock", {"round_id": second["id"], "dice": [4, 4, 3]}, attacker[1])

    def test_a_player_cannot_create_or_join_two_matches(self):
        host, guest, other_host = self.user(), self.user(), self.user()
        first = self.post("create", {}, host[1])["id"]
        second = self.post("create", {}, other_host[1])["id"]
        self.post("join", {"match_id": first}, host[1])
        self.post("join", {"match_id": first}, guest[1])
        self.post("join", {"match_id": first}, guest[1])
        self.post("create", {}, guest[1], 400)
        self.post("join", {"match_id": second}, guest[1], 400)
        self.post("join", {"match_id": second}, host[1], 400)
        self.assertEqual(self.get("matches", second, other_host[1])["player_2"], "")

    def test_concurrent_joins_only_allow_one_match(self):
        host1, host2, guest = self.user(), self.user(), self.user()
        first = self.post("create", {}, host1[1])["id"]
        second = self.post("create", {}, host2[1])["id"]
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            results = list(pool.map(
                lambda match_id: self.request("/api/despot/join", "POST", {"match_id": match_id}, guest[1])[0],
                [first, second],
            ))
        self.assertEqual(sorted(results), [200, 400])

    def test_finished_legacy_match_without_revealed_rounds_is_removed(self):
        host, guest = self.user(), self.user()
        past = (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=6)).isoformat()
        status, match = self.request("/api/collections/matches/records", "POST", {
            "room_code": uuid.uuid4().hex[:8].upper(), "player_1": host[0], "player_2": guest[0],
            "status": "FINISHED", "finished_at": past, "def_score": 3,
            "p1_role_choice": "ATT", "p2_role_choice": "DEF", "current_round": 1,
        }, self.admin)
        self.assertEqual(status, 200, match)
        status, round_record = self.request("/api/collections/rounds/records", "POST", {
            "match_id": match["id"], "round_number": 1, "phase": "LOCKING", "ends_at": past,
            "att_constraint": "FREE", "def_constraint": "FREE", "first_locker": "NONE",
            "ballesteros_hint": "NONE",
        }, self.admin)
        self.assertEqual(status, 200, round_record)
        self.post("create", {}, host[1])
        self.assertEqual(self.request(f'/api/collections/matches/records/{match["id"]}', token=self.admin)[0], 404)
        self.assertEqual(self.request(f'/api/collections/rounds/records/{round_record["id"]}', token=self.admin)[0], 404)


if __name__ == "__main__":
    unittest.main()
