import numpy as np
from itertools import permutations
from scipy.optimize import linprog

def get_valid_plays(budget, mode='free'):
    plays = []
    for p in range(1, 7):
        for q in range(1, 7):
            for r in range(1, 7):
                s = p + q + r
                if s == budget or s == budget - 3:
                    unique = len({p, q, r})
                    if mode == 'free':
                        plays.append((p, q, r))
                    elif mode == 'win' and unique <= 2:
                        plays.append((p, q, r))
                    elif mode == 'lose' and unique == 3:
                        plays.append((p, q, r))
    return plays

def resolve_deterministic(att, def_):
    a = list(att)
    d = list(def_)
    a_wins = 0
    d_wins = 0
    ties = 0
    att_rear_almogavar = False
    
    for i in range(3):
        av, dv = a[i], d[i]
        # Combate
        if av == 1 and dv == 6:
            winner = 'A'
        elif dv == 1 and av == 6:
            winner = 'D'
        elif av > dv:
            winner = 'A'
        elif dv > av:
            winner = 'D'
        else:
            winner = 'D'
            ties += 1
            
        if winner == 'A':
            a_wins += 1
        else:
            d_wins += 1
            
        # Almogavar check
        if not ((av == 6 and dv == 1) or (dv == 6 and av == 1)):
            if av >= 4 and av >= 2 * dv:
                if i < 2:
                    a[i+1] += 1
                else:
                    att_rear_almogavar = True
            if dv >= 4 and dv >= 2 * av:
                if i < 2:
                    d[i+1] += 1
                    
    if a_wins >= 2 or (att_rear_almogavar and ties >= 1):
        round_winner = 'A'
    else:
        round_winner = 'D'
        
    varegos = (a_wins == 3) or (d_wins == 3)
    pts = 2 if varegos else 1
    return round_winner, pts

def expand_turco(play, budget):
    if sum(play) == budget:
        return [(play, 1.0)]
    min_val = min(play)
    idx = play.index(min_val)
    res = []
    for roll in range(1, 7):
        lst = list(play)
        lst[idx] = roll
        res.append((tuple(lst), 1.0/6.0))
    return res

def build_expected_outcomes(att_plays, def_plays):
    # Returns matrix of (prob_A_1pt, prob_A_2pt, prob_D_1pt, prob_D_2pt)
    nA, nD = len(att_plays), len(def_plays)
    M = np.zeros((nA, nD, 4))
    for i, ap in enumerate(att_plays):
        a_exp = expand_turco(ap, 11)
        for j, dp in enumerate(def_plays):
            d_exp = expand_turco(dp, 10)
            for a_real, pa in a_exp:
                for d_real, pd in d_exp:
                    w, pts = resolve_deterministic(a_real, d_real)
                    prob = pa * pd
                    if w == 'A' and pts == 1: M[i,j,0] += prob
                    elif w == 'A' and pts == 2: M[i,j,1] += prob
                    elif w == 'D' and pts == 1: M[i,j,2] += prob
                    elif w == 'D' and pts == 2: M[i,j,3] += prob
    return M

# Precompute matrices for states:
# State 0: R1 (free, free)
# State 1: A won last (win, lose)
# State 2: D won last (lose, win)
states = [('free', 'free'), ('win', 'lose'), ('lose', 'win')]
plays_A = [get_valid_plays(11, s[0]) for s in states]
plays_D = [get_valid_plays(10, s[1]) for s in states]
matrices = [build_expected_outcomes(plays_A[k], plays_D[k]) for k in range(3)]

def solve_zero_sum(payoff):
    # payoff is nA x nD for A. A maximizes, D minimizes.
    nA, nD = payoff.shape
    # Shift payoff to be strictly positive
    shift = np.min(payoff) - 1.0
    P = payoff - shift
    # Maximize v s.t. sum(x_i P_ij) >= v, sum(x_i) = 1, x_i >= 0
    # Minimize sum(y_i) s.t. P^T y >= 1
    c = np.ones(nA)
    A_ub = -P.T
    b_ub = -np.ones(nD)
    res = linprog(c, A_ub=A_ub, b_ub=b_ub, bounds=(0, None), method='highs')
    val = 1.0 / res.fun + shift
    strat_A = res.x / res.fun
    
    # Solve for D: Maximize sum(z_j) s.t. P z <= 1
    c_d = -np.ones(nD)
    A_ub_d = P
    b_ub_d = np.ones(nA)
    res_d = linprog(c_d, A_ub=A_ub_d, b_ub=b_ub_d, bounds=(0, None), method='highs')
    strat_D = res_d.x / (-res_d.fun)
    return val, strat_A, strat_D

# Dynamic Programming for Bo5 (first to 3)
# V[scoreA][scoreD][state] = prob A wins Bo5
V = np.zeros((4, 4, 3))
for sD in range(3):
    for st in range(3):
        V[3][sD][st] = 1.0

bo5_strats = {}
for tot in range(4, -1, -1):
    for sA in range(3):
        sD = tot - sA
        if sD < 0 or sD > 2:
            continue
        for st in range(3):
            if tot == 0 and st != 0: continue
            if tot > 0 and st == 0: continue
            M = matrices[st]
            vA1 = V[min(3, sA+1)][sD][1]
            vA2 = V[min(3, sA+2)][sD][1]
            vD1 = V[sA][min(3, sD+1)][2]
            vD2 = V[sA][min(3, sD+2)][2]
            payoff = M[:,:,0]*vA1 + M[:,:,1]*vA2 + M[:,:,2]*vD1 + M[:,:,3]*vD2
            val, s_a, s_d = solve_zero_sum(payoff)
            V[sA][sD][st] = val
            bo5_strats[(sA, sD, st)] = (val, s_a, s_d)

print("Bo5 Win Prob Attacker at (0,0):", V[0][0][0])
for key in [(0,0,0), (1,0,1), (0,1,2), (2,0,1), (0,2,2), (2,2,1), (2,2,2)]:
    val, sa, sd = bo5_strats[key]
    top_a = sorted(zip(plays_A[key[2]], sa), key=lambda x: -x[1])[:3]
    top_d = sorted(zip(plays_D[key[2]], sd), key=lambda x: -x[1])[:3]
    print(f"Score {key[:2]} st={key[2]}: P(A)={val:.4f} | TopA={[(p, round(w,3)) for p,w in top_a]} | TopD={[(p, round(w,3)) for p,w in top_d]}")

# Analyze rear 1 vs rear 6 (Fuego Griego in rearguard)
print("\n--- REARGUARD 1 ANALYSIS ---")
# Check Attacker plays ending in 1 vs Def plays ending in 1 in R1
r1_val, r1_sa, r1_sd = bo5_strats[(0,0,0)]
print("R1 Total weight of Attacker ending in 1:", sum(w for p, w in zip(plays_A[0], r1_sa) if p[2] == 1))
print("R1 Total weight of Defender ending in 1:", sum(w for p, w in zip(plays_D[0], r1_sd) if p[2] == 1))
print("R1 Total weight of Attacker starting with 1:", sum(w for p, w in zip(plays_A[0], r1_sa) if p[0] == 1))
print("R1 Total weight of Defender starting with 1:", sum(w for p, w in zip(plays_D[0], r1_sd) if p[0] == 1))

# Analyze Ballesteros information leak
# Suppose A plays Nash in R1, and in R2 (A won, st=1) A plays Nash.
# If D gets Ballesteros hint (A_R2 >= A_R1 or A_R2 < A_R1), how much does D's win prob increase if D best-responds to the conditional distribution?
sa_r1 = bo5_strats[(0,0,0)][1]
sa_r2 = bo5_strats[(1,0,1)][1]
pA_r1 = plays_A[0]
pA_r2 = plays_A[1]
pD_r2 = plays_D[1]

def to_num(p): return p[0]*100 + p[1]*10 + p[2]

# Expected payoff matrix for (1,0,1)
M1 = matrices[1]
payoff_101 = M1[:,:,0]*V[2][0][1] + M1[:,:,1]*V[3][0][1] + M1[:,:,2]*V[1][1][2] + M1[:,:,3]*V[1][2][2]
base_val_101 = bo5_strats[(1,0,1)][0]

# Average over all R1 plays of A (weighted by sa_r1)
ev_with_hint = 0.0
prob_ge_total = 0.0
for idx1, p1 in enumerate(pA_r1):
    w1 = sa_r1[idx1]
    if w1 < 1e-9: continue
    n1 = to_num(p1)
    # Conditional dist of p2 given >= n1 and < n1
    ge_weights = np.array([sa_r2[i] if to_num(p2) >= n1 else 0.0 for i, p2 in enumerate(pA_r2)])
    lt_weights = np.array([sa_r2[i] if to_num(p2) < n1 else 0.0 for i, p2 in enumerate(pA_r2)])
    p_ge = ge_weights.sum()
    p_lt = lt_weights.sum()
    prob_ge_total += w1 * p_ge
    
    # D minimizes payoff_101
    if p_ge > 1e-9:
        best_d_ge = np.min((ge_weights / p_ge) @ payoff_101)
        ev_with_hint += w1 * p_ge * best_d_ge
    if p_lt > 1e-9:
        best_d_lt = np.min((lt_weights / p_lt) @ payoff_101)
        ev_with_hint += w1 * p_lt * best_d_lt

print(f"\n--- BALLESTEROS ANALYSIS at (1,0) ---")
print(f"Base P(A wins Bo5) without hint: {base_val_101:.4f}")
print(f"P(A wins Bo5) if D gets hint & best-responds to Nash: {ev_with_hint:.4f} (D gains {(base_val_101 - ev_with_hint)*100:.2f}% match win prob)")