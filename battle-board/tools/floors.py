"""Builds the seven floors of The Lich's Descent as JS map objects, and checks each can be finished."""
import json, math, random, sys
from collections import deque

class G:
    def __init__(s, w, h, fill='#'):
        s.w, s.h = w, h
        s.g = [[fill] * w for _ in range(h)]
        s.data = {'loot': {}, 'chests': {}, 'stash': {}, 'secrets': {}, 'rooms': []}
    def rect(s, x0, z0, x1, z1, ch):
        for z in range(z0, z1 + 1):
            for x in range(x0, x1 + 1):
                s.g[z][x] = ch
        return s
    def outline(s, x0, z0, x1, z1, ch='#'):
        for x in range(x0, x1 + 1): s.g[z0][x] = ch; s.g[z1][x] = ch
        for z in range(z0, z1 + 1): s.g[z][x0] = ch; s.g[z][x1] = ch
        return s
    def blob(s, cx, cz, rx, rz, ch, rough=0.0, seed=1, only=None):
        r = random.Random(seed)
        for z in range(max(1, int(cz - rz - 1)), min(s.h - 1, int(cz + rz + 2))):
            for x in range(max(1, int(cx - rx - 1)), min(s.w - 1, int(cx + rx + 2))):
                d = ((x - cx) / rx) ** 2 + ((z - cz) / rz) ** 2
                if d <= 1 + r.uniform(-rough, rough) and (only is None or s.g[z][x] in only):
                    s.g[z][x] = ch
        return s
    def line(s, x0, z0, x1, z1, ch, width=1):
        n = max(abs(x1 - x0), abs(z1 - z0))
        for i in range(n + 1):
            x = round(x0 + (x1 - x0) * i / max(n, 1)); z = round(z0 + (z1 - z0) * i / max(n, 1))
            for dz in range(width):
                for dx in range(width):
                    if 0 < x + dx < s.w - 1 and 0 < z + dz < s.h - 1: s.g[z + dz][x + dx] = ch
        return s
    def put(s, ch, *pts):
        for x, z in pts:
            assert 0 < x < s.w - 1 and 0 < z < s.h - 1, (ch, x, z)
            s.g[z][x] = ch
        return s
    def scatter(s, ch, n, onto, seed, x0=1, z0=1, x1=None, z1=None):
        r = random.Random(seed); x1 = x1 or s.w - 2; z1 = z1 or s.h - 2; k = 0; tries = 0
        while k < n and tries < 4000:
            tries += 1
            x, z = r.randint(x0, x1), r.randint(z0, z1)
            if s.g[z][x] in onto: s.g[z][x] = ch; k += 1
        return s
    def room(s, x0, z0, x1, z1, name, text, boss=False):
        s.data['rooms'].append({'x0': x0, 'z0': z0, 'x1': x1, 'z1': z1, 'name': name, 'text': text, **({'boss': True} if boss else {})})
    def chest(s, x, z, items, gold): s.put('C', (x, z)); s.data['chests'][f'{x},{z}'] = {'items': items, 'gold': gold}
    def loot(s, x, z, items, gold=0): s.put('$', (x, z)); s.data['loot'][f'{x},{z}'] = {'items': items, 'gold': gold}
    def stash(s, x, z, items, gold, dc=13): s.put('H', (x, z)); s.data['stash'][f'{x},{z}'] = {'items': items, 'gold': gold, 'dc': dc}
    def secret(s, x, z, dc=13): s.put('S', (x, z)); s.data['secrets'][f'{x},{z}'] = {'dc': dc}
    def border(s):
        s.outline(0, 0, s.w - 1, s.h - 1, '#'); return s
    def rows(s): return [''.join(r) for r in s.g]
    def torches(s, every=7, salt=0):
        out = []; used = set()
        OPEN = set('.~pevX123TYZ$H')
        for z in range(s.h):
            for x in range(s.w):
                if s.g[z][x] != '#': continue
                for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    nx, nz = x + dx, z + dz
                    if 0 <= nx < s.w and 0 <= nz < s.h and s.g[nz][nx] in OPEN and ((x * 7 + z * 13 + salt) % every == 0) and (x, z) not in used:
                        if any(abs(x - ox) + abs(z - oz) < 4 for ox, oz, _, _ in out): continue
                        out.append([x, z, dx, dz]); used.add((x, z)); break
        return out

PASS = set('.~pevX123TYZ$HDdnBfszNQLRMAOrkbaWmcoKu@')
def check(name, rows, puzzle=None):
    h, w = len(rows), len(rows[0])
    assert all(len(r) == w for r in rows), f'{name}: ragged rows'
    for r in (rows[0], rows[-1]): assert set(r) == {'#'}, f'{name}: open border'
    assert all(r[0] == '#' and r[-1] == '#' for r in rows), f'{name}: open border'
    start = [(x, z) for z, r in enumerate(rows) for x, ch in enumerate(r) if ch == '@']
    assert len(start) == 1, f'{name}: needs one start'
    def bfs(allow_gate):
        seen = {start[0]}; q = deque([start[0]])
        while q:
            x, z = q.popleft()
            for dx, dz in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                nx, nz = x + dx, z + dz
                ch = rows[nz][nx]
                if (nx, nz) in seen: continue
                if ch in PASS or (allow_gate and ch == 'G'):
                    seen.add((nx, nz)); q.append((nx, nz))
        return seen
    pre = bfs(False)
    plates = {rows[z][x]: (x, z) for z, r in enumerate(rows) for x, ch in enumerate(r) if ch in '123'}
    if 'G' in ''.join(rows):
        assert len(plates) == 3 and all(p in pre for p in plates.values()), f'{name}: plates unreachable before the gate'
    full = bfs(True)
    exits = [(x, z) for z, r in enumerate(rows) for x, ch in enumerate(r) if ch == 'X']
    for e in exits: assert e in full, f'{name}: exit unreachable'
    foes = [(x, z) for z, r in enumerate(rows) for x, ch in enumerate(r) if ch in 'nBfszNQLRMAOrkbaW']
    lost = [f for f in foes if f not in full]
    assert not lost, f'{name}: unreachable monsters {lost}'
    return len(foes)

F = {}

# ---------------------------------------------------------------- 1
g = G(28, 20, 'e').border()
g.rect(1, 1, 3, 2, '#').rect(24, 17, 26, 18, '#').put('#', (1, 3), (4, 1), (26, 16), (1, 18), (2, 18))
for z in range(1, 19): g.put('v', (12, z), (15, z)); g.put('w', (13, z), (14, z))
g.rect(12, 9, 15, 10, 'v')                     # the ford
g.rect(12, 15, 15, 15, '.')                    # an old stone bridge
g.scatter('~', 26, 'e', 11, 1, 1, 11, 18).scatter('~', 14, 'e', 12, 16, 9, 26, 18)
g.put('P', (6, 6), (8, 4), (4, 10)).put('p', (7, 5), (5, 11))
g.outline(17, 1, 26, 8).rect(18, 2, 25, 7, '.')   # the chapel ruin
g.put('~', (17, 5), (26, 3)).put('D', (21, 8)).put('#', (17, 4)).put('P', (20, 4), (23, 4))
g.chest(18, 2, ['potion', 'leather', 'arrowFire', 'manaPotion'], 30); g.put('u', (18, 7), (25, 7), (24, 2)); g.put('X', (25, 2))
g.put('R', (22, 4)).put('n', (24, 5))
g.put('q', (21, 14)).put('c', (18, 17), (19, 17), (18, 16)).put('o', (24, 15), (25, 14)).put('K', (23, 11))
g.put('n', (20, 12), (23, 14), (19, 15)).put('f', (22, 16)).put('a', (25, 12))
g.put('f', (8, 7)).put('n', (9, 12)).put('@', (3, 16))
g.loot(2, 5, ['potion'])
g.room(1, 1, 11, 18, 'The Edge of the Wood', "Thornwick's dead have been vanishing from the churchyard, and the goblins took them. You followed their cart tracks here, to a ruined chapel swallowed by the forest. Smoke rises from a camp across the stream, and something howls in the long grass.")
g.room(16, 9, 26, 18, 'The Raiders\' Camp', 'Crude tents, a spit of something you would rather not name, and sacks stamped with the Thornwick churchyard seal. The goblins have been well paid: black coins glint everywhere. Someone is buying bodies.')
g.room(18, 2, 25, 7, 'The Roofless Chapel', 'Ivy has pulled down the roof, and the saints in the windows have had their faces chiselled off. Behind the altar, a stair spirals down into the dark. Between you and it, a goblin in a wolf-skin cloak swings onto the back of a huge grey wolf.', boss=True)
F[1] = dict(g=g, name='The Overgrown Gate', dark=False, danger=True, fog=True, sight=9, flow=[0.05, 0.45],
    stairsText='The stair spirals down through roots and old stone. The air turns cold and smells of smoke, lamp oil and wet dog.',
    wanderers=[{'types': ['goblin', 'goblin'], 'text': 'Harsh voices to the {dir}: a goblin patrol is coming back from the village.'},
               {'types': ['wolf', 'wolf'], 'text': 'A howl rises to the {dir}, then another. Wolves have your scent.'}], torches=[])

# ---------------------------------------------------------------- 2
g = G(28, 20).border()
g.rect(2, 2, 6, 6, '.')                         # arrival
g.rect(7, 4, 12, 4, '.')                        # tunnel east
g.rect(13, 2, 19, 7, '.')                       # storage
g.rect(4, 7, 4, 11, '.')                        # tunnel south
g.rect(2, 12, 8, 17, '.')                       # kennel
g.rect(16, 8, 16, 10, '.')                      # to the mess hall
g.rect(11, 11, 20, 17, '.')                     # mess hall
g.rect(9, 14, 10, 14, '.')                      # kennel to mess
g.rect(21, 14, 21, 14, 'D')
g.rect(22, 9, 26, 18, '.')                      # the chief's den
g.rect(21, 2, 25, 6, '.'); g.secret(20, 4)      # hidden hoard behind the storeroom
g.scatter('~', 8, '.', 21, 1, 1, 26, 18)
g.put('@', (3, 3)).put('Z', (9, 4)).put('T', (16, 9))
g.put('c', (13, 2), (14, 2), (13, 3), (19, 7), (18, 7)).put('o', (19, 2), (19, 3), (15, 7)).put('K', (17, 2), (14, 6))
g.put('n', (16, 4), (18, 5))
g.put('f', (5, 14), (7, 16)).put('o', (2, 17), (8, 12)).put('b', (3, 16))
g.put('h', (13, 11)).put('c', (15, 13), (16, 13), (15, 15), (16, 15)).put('K', (19, 12), (12, 17))
g.put('n', (14, 14), (18, 14), (17, 16)).put('a', (20, 12))
g.put('B', (24, 13)).put('n', (23, 11), (25, 15)).put('j', (22, 9), (26, 9), (22, 18)).put('X', (26, 17))
g.chest(25, 10, ['greater', 'whisper', 'manaPotion'], 40)
g.chest(24, 3, ['potion', 'potion', 'boneCharm'], 90); g.put('u', (21, 2), (25, 6)); g.stash(22, 6, ['eel'], 25)
g.room(2, 2, 6, 6, 'The Warren Mouth', 'The goblins have dug deep. Their tunnels stink of smoke, wet fur and lamp oil, and powder kegs are stacked carelessly along the walls. One spark down here and the whole hill comes down.')
g.room(13, 2, 19, 7, 'The Storeroom', 'Stolen grain, stolen ale, and three coffins with the lids pried off. Empty. The bodies went somewhere else.')
g.room(2, 12, 8, 17, 'The Kennels', 'Gnawed bones carpet the floor. Not all of them belonged to animals.')
g.room(11, 11, 20, 17, 'The Feasting Hall', 'A fire roars in a hearth hacked from the rock. Goblins squabble over a heap of grave-goods: rings still on fingers, coins still in mouths.')
g.room(22, 9, 26, 18, 'The Chief\'s Den', '"The pale man pays in black gold for every body," snarls Chief Grizzlegut from a throne of stolen coffins. "He will pay well for yours." Behind him, a shaft drops into the deep.', boss=True)
F[2] = dict(g=g, name='The Goblin Warren', dark=True, sight=7,
    stairsText='A rope ladder drops down a natural shaft. Far below, water drips into a cavern, and the goblin noise fades to silence.',
    wanderers=[{'types': ['goblin', 'goblin', 'goblin'], 'text': 'Goblin war-drums start up to the {dir}. They know you are here.'},
               {'types': ['wolf', 'goblin'], 'text': 'Claws on stone to the {dir}: a goblin wolf-rider is hunting you.'}])

# ---------------------------------------------------------------- 3
g = G(30, 20).border()
g.blob(4.5, 4.5, 3, 2.6, '.', 0.3, 31)
g.line(7, 5, 11, 8, '.', 2)
g.blob(15, 10, 7, 6, '.', 0.25, 32)
g.blob(15, 10, 3.6, 2.6, 'v', 0.2, 33).blob(15, 10, 2.4, 1.6, 'w', 0.15, 34)
g.line(20, 7, 23, 5, '.', 2).blob(24.5, 4.5, 3.2, 2.6, '.', 0.3, 35)
g.line(10, 13, 7, 14, '.', 2).blob(5, 15, 3, 2.6, '.', 0.3, 36)
g.line(18, 11, 23, 13, 'v', 2).blob(24.5, 15, 3.2, 2.8, '.', 0.25, 37)
g.scatter('~', 18, '.', 38).scatter('p', 4, '.', 39)
g.put('@', (4, 4)).put('r', (6, 3), (5, 6))
g.put('s', (12, 6), (19, 14)).put('r', (16, 15), (11, 11))
g.put('s', (24, 3), (26, 5)).put('b', (23, 6)).put('u', (22, 4), (27, 4), (26, 3)); g.loot(25, 2, ['greater', 'sunder', 'arrowFrost'], 30)
g.put('F', (4, 15)); g.put('I', (6, 13)); g.put('u', (3, 16), (7, 16))
g.put('z', (24, 14)).put('M', (26, 15)).put('X', (25, 17)).put('Y', (22, 15))
g.room(2, 2, 7, 7, 'The Weeping Caves', 'The goblin warren breaks into a natural cavern. Water drips from a thousand stone teeth, and the walls glitter with webs as thick as sailcloth. Something large shifts on the ceiling.')
g.room(9, 5, 21, 15, 'The Black Lake', 'A still black lake fills the heart of the cavern. Wrapped shapes hang from the webs above it, slowly turning. Some of them still twitch.')
g.room(21, 2, 27, 7, 'The Nest', 'The webs here are thick with bones and grave-goods. Whatever the goblins could not carry, the spiders took.')
g.room(2, 12, 8, 17, 'The Old Shrine', 'A spring bubbles up through carved stone. Someone built a shrine here long ago, before the dark crept in. A tablet beside it is scratched with a warning.')
g.room(21, 12, 27, 18, 'The Drowned Steps', 'Stone steps lead down into an older place. A body lies across them, bloated and grey. As your light touches it, its fingers curl. Above the steps, something vast and many-legged unfolds from a cocoon of silk.', boss=True)
F[3] = dict(g=g, name='The Weeping Caves', dark=True, sight=7, flow=[0.4, 0.1],
    tablet='Turn back. Below the lake lie the halls of the Pale Crown, where the dead do not rest. We sealed it once. We could not seal it twice.',
    stairsText='The steps sink into black water and come out somewhere colder. The smell of rot rises to meet you.',
    wanderers=[{'types': ['spider'], 'text': 'Something skitters across the ceiling to the {dir}. The webs are trembling.'},
               {'types': ['rat', 'rat', 'rat'], 'text': 'A tide of squeaking pours out of a crack to the {dir}.'}])

# ---------------------------------------------------------------- 4
g = G(28, 20).border()
g.rect(2, 2, 8, 6, '.')                         # entry
g.rect(9, 4, 9, 4, '.')
g.rect(10, 2, 25, 6, '.').rect(10, 3, 25, 5, 'v')  # flooded nave
g.rect(5, 7, 5, 8, '.')
g.rect(2, 9, 8, 17, '.')                        # west ossuary
g.rect(9, 13, 9, 13, '.')
g.rect(10, 9, 17, 17, '.').blob(13.5, 13, 2.6, 2.2, 'v', 0, 41).blob(13.5, 13, 1.4, 1.1, 'w', 0, 42)
g.rect(21, 7, 21, 7, '.').put('D', (21, 8))
g.rect(19, 9, 26, 17, '.')                      # exit chamber
g.rect(18, 15, 18, 15, '.')
g.put('P', (12, 3), (16, 3), (20, 3), (24, 3), (12, 5), (16, 5), (20, 5), (24, 5))
g.put('P', (3, 10), (7, 10), (3, 16), (7, 16), (20, 10), (25, 10), (20, 16), (25, 16))
g.put('@', (3, 4)).put('u', (2, 2), (8, 2), (8, 6))
g.put('z', (14, 4), (19, 4), (23, 4)).put('u', (11, 2), (15, 2), (19, 6), (25, 2))
g.put('b', (3, 12), (6, 14), (11, 10)).put('k', (5, 11), (15, 10)).put('z', (12, 16), (16, 16)).put('u', (2, 17), (8, 9), (17, 9))
g.put('Z', (5, 8)).put('r', (6, 16))
g.put('z', (21, 12), (24, 14)).put('A', (23, 11)).put('j', (19, 9), (26, 9)).put('X', (25, 13))
g.chest(26, 17, ['greater', 'wardenHelm', 'manaPotion'], 60); g.stash(2, 13, ['potion', 'boneCharm'], 30, 14)
g.room(2, 2, 8, 6, 'The Drowned Ossuary', 'Below the caves lies an older place: a flooded hall of the dead. Bodies float in the black water, and the goblins\' gifts are piled at the door, still in their sacks. Those sacks are empty now.')
g.room(10, 2, 25, 6, 'The Flooded Nave', 'Knee-deep water fills the nave. Shapes stand in it, perfectly still, facing the far end of the hall. One by one they turn toward the splashing of your boots.')
g.room(2, 9, 17, 17, 'The Bone Galleries', 'Skulls line every wall, thousands of them, sorted by size. Somebody has been taking them down and putting the skeletons back together.')
g.room(19, 9, 26, 17, 'The Stair of Candles', 'Braziers burn with a cold green flame. Fresh footprints lead downstairs: bare feet, and a long trailing robe. In the green light waits the abbot of this drowned house, bloated and crowned, still wearing his mitre.', boss=True)
F[4] = dict(g=g, name='The Drowned Ossuary', dark=True, sight=7, flow=[0.45, 0.05],
    stairsText='Below, you hear chanting. Many voices, all saying the same name.',
    wanderers=[{'types': ['zombie', 'zombie'], 'text': 'Something splashes through the water to the {dir}, slow and heavy and tireless.'},
               {'types': ['skeleton', 'skeleton'], 'text': 'Bones clatter to the {dir} as the galleries give up their dead.'}])

# ---------------------------------------------------------------- 5
g = G(28, 20).border()
g.rect(2, 8, 6, 12, '.')                        # vestibule
g.rect(7, 10, 7, 10, '.')
g.rect(8, 2, 19, 17, '.')                       # temple hall
for z in (4, 7, 12, 15): g.put('P', (10, z), (17, z))
g.rect(13, 3, 14, 4, 'l')                       # the fire altar
g.put('j', (12, 3), (15, 3), (11, 9), (16, 9), (11, 11), (16, 11))
g.put('I', (13, 10)).put('1', (10, 10)).put('2', (13, 14)).put('3', (17, 10))
g.put('G', (20, 10)).rect(21, 10, 22, 10, '.')
g.rect(23, 7, 26, 13, '.')                      # stair chamber
g.put('D', (20, 3)).rect(21, 2, 26, 5, '.')     # library
g.put('D', (20, 16)).rect(21, 15, 26, 18, '.')  # crypts
g.put('@', (3, 10))
g.put('N', (12, 6), (15, 13), (18, 5)).put('k', (9, 3), (18, 16)).put('z', (9, 15))
g.put('u', (8, 2), (19, 2), (8, 17), (19, 17))
g.put('N', (24, 3)).put('c', (26, 2), (26, 3)).put('h', (23, 2)); g.chest(21, 2, ['greater', 'potion', 'manaPotion', 'arrowStorm'], 80)
g.put('b', (22, 16), (25, 17)).put('z', (24, 15)).put('u', (21, 18), (26, 18)); g.loot(26, 15, ['wardenBlade'])
g.put('z', (24, 8), (25, 12)).put('O', (24, 10)).put('X', (26, 10)).put('j', (23, 7), (23, 13))
g.room(2, 8, 6, 12, 'The Sanctum of the Pale Crown', 'Black candles. Bone-white robes. Chanting echoes through a temple carved from the living rock. The cult of the Pale Crown has made this place a factory for the dead.')
g.room(8, 2, 19, 17, 'The Temple of Three Lights', 'Fire pours from a cracked altar in the north. Before it stands a tablet, and set into the floor are three plates: a sun, a moon and a star. To the east, an iron portcullis bars the way down.')
g.room(21, 2, 26, 5, 'The Cult Library', 'Shelves of skin-bound books, and a desk covered in notes about raising the dead, written in a fine, patient hand. Every page is signed: V.M.')
g.room(23, 7, 26, 13, 'The Priest\'s Stair', 'Behind the portcullis, High Priest Ossian turns from the stair with a patient smile. "You have come so far to join us," he says. "Let me show you the rest of the way."', boss=True)
g.room(21, 15, 26, 18, 'The Waiting Crypts', 'Rows of fresh bodies lie on stone slabs, ready to be raised. Some of them have already started without the priests.')
F[5] = dict(g=g, name='The Sanctum of the Pale Crown', dark=True, sight=7, puzzleOrder=['3', '2', '1'],
    tablet='First the <b>star</b> that guides the dead. Then the <b>moon</b> that wakes them. Last the <b>sun</b> they will never see again.',
    stairsText='The stairs grow hot underfoot. Red light flickers from below, and with it a cold that has nothing to do with the air.',
    wanderers=[{'types': ['cultist', 'skeleton'], 'text': 'Chanting grows louder to the {dir}. A priest and its servant are searching for you.'},
               {'types': ['zombie', 'zombie', 'zombie'], 'text': 'Shuffling feet to the {dir}. The crypts are emptying.'}])

# ---------------------------------------------------------------- 6
g = G(30, 20).border()
g.rect(2, 2, 13, 17, '.')
g.rect(14, 1, 16, 18, 'l')
g.rect(14, 5, 16, 5, '.').rect(14, 14, 16, 14, '.')   # two bridges
g.rect(17, 2, 18, 17, '.')
g.rect(19, 2, 19, 17, '#').put('D', (19, 5)).put('D', (19, 14))
g.rect(20, 2, 27, 17, '.')
for z in (4, 8, 11, 15): g.put('P', (5, z), (10, z))
g.put('P', (22, 4), (25, 4), (22, 15), (25, 15))
g.put('@', (3, 10)).put('z', (8, 6), (9, 13)).put('N', (11, 10)).put('u', (2, 2), (2, 17), (13, 2)).put('K', (12, 16), (13, 17))
g.put('Q', (17, 5), (17, 14))
g.put('W', (24, 10)).put('N', (21, 7), (21, 12)).put('K', (20, 9), (20, 10)).put('j', (23, 7), (23, 12), (26, 7), (26, 12))
g.put('X', (26, 10)).put('u', (27, 2), (27, 17), (20, 2))
g.chest(27, 9, ['greater', 'greater'], 120); g.loot(2, 9, ['potion', 'potion'])
g.room(2, 2, 13, 17, 'The Burning Halls', 'The air shimmers with heat. A river of molten rock splits the hall in two, and pale cold shapes drift above it, untouched by the fire. The Restless have been waiting for you.')
g.room(17, 2, 18, 17, 'The Far Bank', 'Up close, the wraiths have faces: Thornwick faces. The miller. The blacksmith\'s wife. They do not know you any more.')
g.room(20, 2, 27, 17, 'The Warden\'s Gate', 'An armoured giant stands before the last stair, a greatsword planted at its feet. Its helm turns toward you, and green fire kindles behind the visor.', boss=True)
F[6] = dict(g=g, name='The Burning Halls', dark=True, sight=8, flow=[0.02, 0.5],
    stairsText='The last stair. Below it, the heart of the mountain, and the one who has been waiting all along.',
    wanderers=[{'types': ['zombie', 'cultist'], 'text': 'A priest drives its dead toward you from the {dir}.'},
               {'types': ['skeleton', 'skeleton', 'skeleton'], 'text': 'Bones knit together to the {dir}. The halls are raising a guard.'}])

# ---------------------------------------------------------------- 7
g = G(30, 22).border()
g.rect(2, 2, 27, 19, '.')
g.blob(15, 10, 8.5, 6.5, 'l', 0.12, 71)
g.blob(15, 9.5, 3.3, 2.6, '.', 0, 72)
g.rect(15, 12, 15, 19, '.')                     # the southern causeway
g.rect(6, 9, 12, 9, '.')                        # the western causeway
for x in (3, 8, 22, 27):
    for z in (3, 18): g.put('P', (x, z))
g.put('j', (13, 8), (17, 8), (13, 11), (17, 11), (5, 5), (25, 5), (5, 15), (25, 15))
g.put('L', (15, 9)).put('Q', (13, 16), (17, 16)).put('N', (4, 6), (26, 6)).put('z', (6, 17), (24, 17)).put('K', (20, 17), (10, 17))
g.put('@', (15, 20 - 1))
g.put('u', (2, 2), (27, 2), (2, 19), (27, 19))
g.room(1, 12, 28, 20, 'The Throne of Vael Morrow', 'At the heart of the mountain, on an island in a lake of fire, sits Vael Morrow, Lich of the Pale Crown. "Thornwick sends me a hero," it whispers, and its voice is everywhere at once. "How thoughtful. I needed a new captain."', boss=True)
F[7] = dict(g=g, name='The Throne of Vael Morrow', dark=True, sight=9, flow=[0.25, 0.2], wanderers=[],
    finale={'title': 'The Pale Crown falls', 'text': 'Vael Morrow\'s phylactery cracks with a sound like a bell breaking, and a scream that is centuries old tears through the mountain. All through the halls above, the dead of Thornwick lie down and are still. You climb back toward the daylight carrying the Pale Crown, and the story of the hero who walked into the dark and came back out.'})

# ---------------------------------------------------------------- emit
out = []
for n in range(1, 8):
    f = F[n]; g = f.pop('g'); rows = g.rows()
    foes = check(f'floor {n}', rows)
    m = {'name': f.pop('name'), 'floor': n, 'campaign': 'descent', 'rev': 1, 'dark': f.pop('dark'), 'fog': f.pop('fog', True),
         'rows': rows, 'torches': f.pop('torches', None), **g.data, **f}
    if m['torches'] is None: m['torches'] = g.torches(every=6 if n < 7 else 5, salt=n)
    if n < 7: m['next'] = f'descent{n + 1}'
    if n > 1: m['hidden'] = True
    else: m['title'] = "The Lich's Descent"; m['floors'] = 7; m['desc'] = 'Goblins have been stealing the dead of Thornwick. Follow them down through seven floors, from a sunlit ruin to the throne of a lich.'
    if 'puzzleOrder' in m:
        gate = next((x, z) for z, r in enumerate(rows) for x, ch in enumerate(r) if ch == 'G')
        m['puzzle'] = {'order': m['puzzleOrder'], 'gate': list(gate)}
    print(f'floor {n}: {len(rows[0])}x{len(rows)}, {foes} foes, {len(m["torches"])} torches', file=sys.stderr)
    out.append(f'  descent{n}: {json.dumps(m, ensure_ascii=False)},')
open(sys.argv[1], 'w').write('\n'.join(out) + '\n')
for n in (1, 3, 7):
    pass
