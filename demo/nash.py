import numpy as np
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
    d = list(reversed(def_))  # Espejo: a vs d, a vs d, a vs d
    a_wins = 0
    d_wins = 0
    ties = 0
    att_rear_almogavar = False
    
    for i in range(3):
        av, dv = a[i], d[i]
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

states = [('free', 'free'), ('win', 'lose'), ('lose', 'win')]
plays_A = [get_valid_plays(11, s[0]) for s in states]
plays_D = [get_valid_plays(10, s[1]) for s in states]
matrices = [build_expected_outcomes(plays_A[k], plays_D[k]) for k in range(3)]

def solve_zero_sum(payoff):
    nA, nD = payoff.shape
    shift = np.min(payoff) - 1.0
    P = payoff - shift
    res = linprog(np.ones(nA), A_ub=-P.T, b_ub=-np.ones(nD), bounds=(0, None), method='highs')
    val = 1.0 / res.fun + shift
    strat_A = res.x / res.fun
    
    res_d = linprog(-np.ones(nD), A_ub=P, b_ub=np.ones(nA), bounds=(0, None), method='highs')
    strat_D = res_d.x / (-res_d.fun)
    return val, strat_A, strat_D

# Programación Dinámica Bo5 (Sin pistas de Ballesteros / Empate de tempo)
V = np.zeros((4, 4, 3))
for sD in range(3):
    for st in range(3):
        V[3][sD][st] = 1.0

bo5_strats = {}
for tot in range(4, -1, -1):
    for sA in range(3):
        sD = tot - sA
        if sD < 0 or sD > 2: continue
        for st in range(3):
            if tot == 0 and st != 0: continue
            if tot > 0 and st == 0: continue
            M = matrices[st]
            payoff = (M[:,:,0]*V[min(3, sA+1)][sD][1] + 
                      M[:,:,1]*V[min(3, sA+2)][sD][1] + 
                      M[:,:,2]*V[sA][min(3, sD+1)][2] + 
                      M[:,:,3]*V[sA][min(3, sD+2)][2])
            val, s_a, s_d = solve_zero_sum(payoff)
            V[sA][sD][st] = val
            bo5_strats[(sA, sD, st)] = (val, s_a, s_d)

def to_num_att_perspective(play, is_defender=False):
    # Siempre se lee desde la perspectiva atacante (Vanguardia A -> Retaguardia A)
    p = list(reversed(play)) if is_defender else list(play)
    return p*100 + p*10 + p

def solve_ballesteros_lock_first(payoff, plays_first, plays_second, prev_num, first_is_attacker=True):
    """
    Calcula el Equilibrio de Nash Bayesiano cuando el Jugador 1 fija primero
    y el Jugador 2 recibe la pista (>= prev_num o < prev_num).
    El Jugador 1 debe elegir una distribución óptima sabiendo que su jugada será filtrada por la pista.
    """
    ge_idx = [i for i, p in enumerate(plays_first) if to_num_att_perspective(p, not first_is_attacker) >= prev_num]
    lt_idx = [i for i, p in enumerate(plays_first) if to_num_att_perspective(p, not first_is_attacker) < prev_num]
    
    # En un juego de señales donde J1 elige acción y J2 observa la partición (GE o LT),
    # J2 elige una acción d_ge si ve GE y d_lt si ve LT.
    # Podemos resolver el juego completo expandiendo las estrategias de J2 a pares (d_ge, d_lt)
    # o resolviendo directamente por programación lineal sobre las variables de J1:
    # Maximizar v_ge + v_lt sujeto a:
    # sum_{i in GE} x_i * P(i, j) >= v_ge  para todo j (si A fija primero)
    # sum_{i in LT} x_i * P(i, j) >= v_lt  para todo j
    # sum(x_i) = 1, x_i >= 0
    n1 = len(plays_first)
    n2 = len(plays_second)
    
    if first_is_attacker:
        # A maximiza v_ge + v_lt. Variables: [x_0..x_{n1-1}, v_ge, v_lt]
        # Shift payoff > 0 para evitar problemas de signo con v_ge, v_lt
        shift = np.min(payoff) - 1.0
        P = payoff - shift
        c = np.zeros(n1 + 2)
        c[n1] = -1.0   # -v_ge
        c[n1+1] = -1.0 # -v_lt
        
        A_ub = []
        b_ub = []
        # Restricciones para GE: -sum_{i in GE} x_i P[i,j] + v_ge <= 0
        for j in range(n2):
            row = np.zeros(n1 + 2)
            for i in ge_idx: row[i] = -P[i, j]
            row[n1] = 1.0
            A_ub.append(row)
            b_ub.append(0.0)
        # Restricciones para LT: -sum_{i in LT} x_i P[i,j] + v_lt <= 0
        for j in range(n2):
            row = np.zeros(n1 + 2)
            for i in lt_idx: row[i] = -P[i, j]
            row[n1+1] = 1.0
            A_ub.append(row)
            b_ub.append(0.0)
            
        A_eq = [np.append(np.ones(n1), [0.0, 0.0])]
        b_eq = [1.0]
        bounds = [(0, None)]*n1 + [(0, None), (0, None)]
        
        res = linprog(c, A_ub=A_ub, b_ub=b_ub, A_eq=A_eq, b_eq=b_eq, bounds=bounds, method='highs')
        ev = (-res.fun) + shift
        opt_x = res.x[:n1]
        return ev, opt_x
    else:
        # D fija primero (D minimiza payoff de A -> equivale a D maximiza -payoff)
        neg_payoff = -payoff
        ev_neg, opt_x = solve_ballesteros_lock_first(neg_payoff, plays_first, plays_second, prev_num, True)
        return -ev_neg, opt_x

print(f"=== EQUILIBRIO DE NASH CORREGIDO (ESPEJO + SIN RELLENO) ===")
print(f"Probabilidad Victoria Atacante Bo5 (Inicio 0-0): {V[0][0][0]*100:.2f}%")
print(f"Probabilidad Victoria Defensor Bo5 (Inicio 0-0): {(1 - V[0][0][0])*100:.2f}%\n")

# Ejemplo de Ballesteros en Ronda 2 tras ganar Atacante (Score 1-0, state 1)
M1 = matrices[1]
payoff_101 = M1[:,:,0]*V[2][0][1] + M1[:,:,1]*V[3][0][1] + M1[:,:,2]*V[1][1][2] + M1[:,:,3]*V[1][2][2]
base_val = bo5_strats[(1,0,1)][0]

print(f"--- ANÁLISIS BALLESTEROS EN RONDA 2 (Marcador 1-0, Atacante en Orden) ---")
print(f"Valor base si nadie fija primero (sin pista): P(A gana Bo5) = {base_val*100:.2f}%\n")

for prev_play in [(5,5,1), (4,2,5), (3,6,2), (1,5,5)]:
    prev_num = to_num_att_perspective(prev_play, is_defender=False)
    ev_lock, opt_strat = solve_ballesteros_lock_first(payoff_101, plays_A[1], plays_D[1], prev_num, first_is_attacker=True)
    top_plays = sorted(zip(plays_A[1], opt_strat), key=lambda x: -x[1])[:3]
    print(f"Si A jugó {prev_play} (ancla={prev_num}) en R1 y fija PRIMERO en R2:")
    print(f"  -> P(A gana Bo5) baja a {ev_lock*100:.2f}% (Costo de información: {(ev_lock - base_val)*100:.2f}%)")
    print(f"  -> Mezcla óptima anti-lectura de A: {[(p, round(w, 3)) for p, w in top_plays]}\n")