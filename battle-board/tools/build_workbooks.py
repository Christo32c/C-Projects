"""Builds the two reference workbooks from a catalogue dump of the game.

    node tests/run-tests.mjs --catalog catalog.json      (renders every model and dumps the data tables)
    python3 tools/build_workbooks.py catalog.json docs/

Writes docs/stats-and-rules.xlsx (abilities, derived stats, levels, talents, spells, effects) and
docs/items-and-monsters.xlsx (every item and every monster or prop, each with a picture of its model).
"""
import base64, io, json, os, sys
from collections import defaultdict
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from PIL import Image as PILImage

cat = json.load(open(sys.argv[1]))
out_dir = sys.argv[2] if len(sys.argv) > 2 else 'docs'
os.makedirs(out_dir, exist_ok=True)
D, IMG = cat['data'], cat['images']
ITEMS, MONSTERS, LOOT, SPELLS, STATUS, TALENTS = D['ITEMS'], D['MONSTERS'], D['LOOT_TABLES'], D['SPELLS'], D['STATUS'], D['TALENTS']
CHAR_OF = defaultdict(list)
for ch, t in D['CREATURE_CHARS'].items(): CHAR_OF[t].append(ch)
ABIL = dict((k, n) for k, n in D['ABILITIES'])

FONT = 'Arial'
HEAD = PatternFill('solid', fgColor='2B241D')
INPUT = PatternFill('solid', fgColor='FFFF00')
thin = Side(style='thin', color='CFC6B8')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)

def sheet(wb, title, headers, widths, first=False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(headers)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
        c = ws.cell(row=1, column=i)
        c.font = Font(name=FONT, bold=True, color='FFFFFF'); c.fill = HEAD
        c.alignment = Alignment(vertical='center', wrap_text=True); c.border = BORDER
    ws.row_dimensions[1].height = 30
    ws.freeze_panes = 'B2' if title in ('Items', 'Monsters & props') else 'A2'
    return ws

def style_rows(ws, start=2, height=None):
    for row in ws.iter_rows(min_row=start, max_row=ws.max_row):
        for c in row:
            c.font = Font(name=FONT, size=10, bold=c.font.bold)
            c.alignment = Alignment(vertical='top', wrap_text=True)
            c.border = BORDER
        if height: ws.row_dimensions[row[0].row].height = height

def dice(d):
    if not d: return ''
    n, s = d[0], d[1]
    b = d[2] if len(d) > 2 and isinstance(d[2], (int, float)) else 0
    return f'{n}d{s}' + (f' + {b}' if b else '')

def add_image(ws, cell, data_url, px=118):
    raw = base64.b64decode(data_url.split(',', 1)[1])
    im = PILImage.open(io.BytesIO(raw)).convert('RGB').resize((px, px))
    buf = io.BytesIO(); im.save(buf, format='PNG'); buf.seek(0)
    xi = XLImage(buf); xi.width = xi.height = px
    ws.add_image(xi, cell)

# where things turn up: loot tables and the hand-placed chests, treasure and caches on every map
found = defaultdict(set)
for mon, tab in LOOT.items():
    for e in tab:
        if e.get('item'): found[e['item']].add(f"{MONSTERS[mon]['name']} ({int(round(e['p'] * 100))}%)")
appears = defaultdict(lambda: defaultdict(int))
for key, m in D['maps'].items():
    label = (f"Floor {m['floor']}: " if m.get('floor') else '') + m['name']
    for f, what in (('chests', 'chest'), ('loot', 'floor'), ('stash', 'hidden cache')):
        for pos, v in (m.get(f) or {}).items():
            for it in v.get('items', []): found[it].add(f'{label} ({what})')
    for ch in ''.join(m['rows']):
        t = D['CREATURE_CHARS'].get(ch)
        if t: appears[t][label] += 1

# ======================================================================= stats and rules
wb = Workbook()
ws = sheet(wb, 'Abilities', ['Ability', 'Short', 'What it does in the game', 'Talents it unlocks', 'Example score', 'Modifier'], [16, 7, 70, 46, 13, 11], first=True)
EFFECTS = {
    'str': 'Melee attack and damage with Strength weapons (longsword, greatswords). Strength saves (Vine Growth). Carrying capacity = score × 15 lb.',
    'dex': 'Armour Class (light armour adds all of it, chain shirt max +2). Initiative. Attack and damage with bows and finesse weapons (dagger, Eelblade, Venom Fang). Dex saves against traps, fireballs and keg blasts.',
    'con': 'Hit points: 10 + CON mod at level 1, then 6 + CON mod per level.',
    'int': 'Spellcasting: spell save DC = 8 + proficiency + INT mod; spell attack = proficiency + INT mod. Maximum mana (+2 per point of modifier). Healing Word adds INT mod.',
    'wis': 'Perception for Search (secret doors, traps, hidden caches) and passive Perception.',
    'cha': 'No direct rule. It only matters through its talents (party buffs, luck and gold).',
}
START = {'str': 14, 'dex': 14, 'con': 14, 'int': 16, 'wis': 10, 'cha': 9}   # the default hero's scores
for i, (k, name) in enumerate(D['ABILITIES'], start=2):
    ws.append([name, k.upper(), EFFECTS[k], ', '.join(t['name'] for t in TALENTS[k].values()), START[k], f'=INT((E{i}-10)/2)'])
    ws.cell(row=i, column=5).fill = INPUT
style_rows(ws)
n = ws.max_row + 2
ws.cell(row=n, column=1, value='How to use').font = Font(name=FONT, bold=True)
ws.cell(row=n + 1, column=1, value='Example scores are the default new hero (point buy, +1 human bonus). Change any yellow Example score to see its modifier. Modifier = round down((score − 10) ÷ 2), the same as the game.').font = Font(name=FONT, size=10)
ws.cell(row=n + 2, column=1, value='Talents: raising an ability to 12, 14, 16, 18 or 20 with stat points (2 per level) unlocks one talent of that ability.').font = Font(name=FONT, size=10)

ws = sheet(wb, 'Derived stats', ['Stat', 'Formula in the game', 'Inputs for the example', 'Example value', 'Notes'], [22, 58, 24, 14, 50])
ws.append(['Level (input)', 'Your character level', '', 3, ''])
ws.append(['CON score (input)', '', '', 14, ''])
ws.append(['INT score (input)', '', '', 16, ''])
ws.append(['DEX score (input)', '', '', 14, ''])
for r in range(2, 6): ws.cell(row=r, column=4).fill = INPUT
ws.append(['Proficiency bonus', '2 + round down((level − 1) ÷ 4)', 'Level', '=2+INT((D2-1)/4)', 'Added to weapon attacks, spell attacks, spell DC and Perception.'])
ws.append(['Maximum HP', '10 + CON mod + (level − 1) × (6 + CON mod)', 'Level, CON', '=10+INT((D3-10)/2)+(D2-1)*(6+INT((D3-10)/2))', 'Tough talent adds 2 × level.'])
ws.append(['Maximum mana', '6 + 4 × level + 2 × max(0, INT mod)', 'Level, INT', '=6+4*D2+2*MAX(0,INT((D4-10)/2))', 'Arcane Reservoir adds 6. Regain 1 per turn in a fight (2 with Mana Spring) and 1 per 4 squares walked.'])
ws.append(['Spell save DC', '8 + proficiency + INT mod', 'Level, INT', '=8+D6+INT((D4-10)/2)', 'Monsters roll d20 + their save bonus against this.'])
ws.append(['Spell attack', 'proficiency + INT mod', 'Level, INT', '=D6+INT((D4-10)/2)', '+2 with Blessed, −2 with Poisoned, +2 with Spell Sniper.'])
ws.append(['Armour Class (chain shirt + shield)', '13 + min(DEX mod, 2) + 2', 'DEX', '=13+MIN(INT((D5-10)/2),2)+2', 'Leather: 11 + full DEX mod. No armour: 10 + DEX mod. Helms +1/+2. Warded +4, Hasted +2, Chilled −1.'])
ws.append(['Initiative', 'd20 + DEX mod', 'DEX', '=INT((D5-10)/2)', 'Shown as the bonus. Lightning Reflexes +5; Commanding Voice +3 for the party.'])
ws.append(['Movement', '30 ft (6 squares) a turn', '', 30, 'Hasted +15 ft, Quickstep +10 ft, Chilled halves it. Dash doubles it. Rubble, shallow water and vines cost double.'])
ws.append(['Weapon attack', 'd20 + ability mod + proficiency', '', '', 'Strength for most weapons, Dexterity for bows, the better of the two for finesse weapons.'])
ws.append(['Critical hit', 'natural 20 (19–20 with Brute, melee)', '', '', 'Doubles the damage dice.'])
style_rows(ws)
for r in range(2, 6): ws.cell(row=r, column=1).font = Font(name=FONT, size=10, bold=True)
ws.cell(row=ws.max_row + 2, column=1, value='Change the yellow inputs (rows 2–5) to recalculate the examples.').font = Font(name=FONT, size=10, italic=True)

ws = sheet(wb, 'Levels', ['Level', 'Total XP needed', 'Proficiency bonus', 'Max HP (CON below)', 'Max mana (INT below)', 'Stat points earned (total)', 'Spells learned at this level'], [8, 16, 16, 18, 18, 20, 52])
learn = defaultdict(list)
for k, sp in SPELLS.items(): learn[sp['unlock']].append(sp['name'])
for lv in range(1, 21):
    r = lv + 1
    ws.append([lv, D['XP_TABLE'][lv - 1], f'=2+INT((A{r}-1)/4)', f'=10+INT(($J$1-10)/2)+(A{r}-1)*(6+INT(($J$1-10)/2))',
               f'=6+4*A{r}+2*MAX(0,INT(($J$2-10)/2))', f'=2*(A{r}-1)', ', '.join(learn.get(lv, []))])
style_rows(ws)
for r in range(2, 22): ws.cell(row=r, column=2).number_format = '#,##0'
ws['I1'] = 'CON score'; ws['J1'] = 14; ws['I2'] = 'INT score'; ws['J2'] = 16
for c in ('J1', 'J2'): ws[c].fill = INPUT; ws[c].font = Font(name=FONT, bold=True)
for c in ('I1', 'I2'): ws[c].font = Font(name=FONT, bold=True)
ws.column_dimensions['I'].width = 12
ws['J1'].comment = Comment('Change this to see max HP at every level.', 'Battle Board')
ws['J2'].comment = Comment('Change this to see max mana at every level.', 'Battle Board')

ws = sheet(wb, 'Talents', ['Ability', 'Talent', 'Effect', 'How you get it'], [16, 22, 70, 46])
for k, ts in TALENTS.items():
    for tid, t in ts.items():
        ws.append([ABIL[k], t['name'], t['desc'], f'Raise {ABIL[k]} to 12, 14, 16, 18 or 20 with stat points, then pick it.'])
style_rows(ws)

ws = sheet(wb, 'Spells', ['Spell', 'Learned at level', 'Mana cost', 'Range (squares)', 'Range (ft)', 'Area', 'Targets', 'Damage', 'Damage type', 'Resolved by', 'Applies effect', 'Effect rounds', 'Chance', 'Description'],
           [18, 10, 9, 10, 9, 14, 10, 10, 11, 16, 14, 9, 9, 70])
for i, (k, sp) in enumerate(SPELLS.items(), start=2):
    by = 'spell attack vs AC' if sp.get('attack') else (f"{sp['save'].upper()} save vs DC" if sp.get('save') else ('automatic' if sp.get('status') or sp.get('heal') else '—'))
    st = sp.get('status')
    ws.append([sp['name'], sp['unlock'], sp['cost'], sp['range'], f'=D{i}*5', sp.get('area', ''), sp.get('target', 'area'),
               dice(sp.get('damage')) or (dice(sp['heal']) + ' + INT mod healing' if sp.get('heal') else ''), sp.get('dmgType', ''), by,
               STATUS[st[0]]['name'] if st else ('Restrained' if k == 'vines' else ''), st[1] if st else (sp.get('duration') or ''), (st[2] if st else None), sp['desc']])
    if st: ws.cell(row=i, column=13).number_format = '0%'
style_rows(ws)

ws = sheet(wb, 'Effects', ['Effect', 'Icon', 'Kind', 'What it does', 'Caused by'], [16, 7, 9, 52, 70])
src = defaultdict(list)
for k, sp in SPELLS.items():
    if sp.get('status'): src[sp['status'][0]].append(f"spell: {sp['name']}")
for k, it in ITEMS.items():
    if it.get('onHit'): src[it['onHit']['status']].append(f"{'arrow' if it['type'] == 'ammo' else 'weapon'}: {it['name']}")
for t, m in MONSTERS.items():
    if m.get('onHit'): src[m['onHit']['status']].append(f"monster: {m['name']}")
src['blessed'].append('High Priest Ossian (blesses his followers)'); src['shielded'].append('High Priest Ossian (wards himself)')
src['blessed'].append('talent: Inspiring Presence')
for k, S in STATUS.items():
    ws.append([S['name'], S['icon'], 'Debuff' if S.get('bad') else 'Buff', S['desc'], '; '.join(src[k])])
style_rows(ws)
ws.cell(row=ws.max_row + 2, column=1, value='Damage and healing over time happen at the start of the bearer\'s turn; durations count down at the end of it. Every effect clears when the fight ends.').font = Font(name=FONT, size=10, italic=True)
wb.save(os.path.join(out_dir, 'stats-and-rules.xlsx'))

# ======================================================================= items and monsters
wb = Workbook()
ws = sheet(wb, 'Items', ['Picture', 'Item', 'Key', 'Type', 'Damage', 'Bonus damage', 'Properties', 'Defence / healing / uses', 'On-hit effect', 'Description', 'Where it is found'],
           [18, 20, 13, 11, 10, 18, 22, 20, 22, 48, 44], first=True)
STARTING = ('longsword', 'shortbow', 'dagger', 'chain', 'shield', 'potion', 'rope', 'torch', 'rations')
TYPE = {'weapon': 'Weapon', 'armor': 'Armour', 'shield': 'Shield', 'head': 'Head', 'neck': 'Neck', 'consumable': 'Consumable', 'gear': 'Gear', 'ammo': 'Arrows'}
for k, it in ITEMS.items():
    props = []
    if it.get('ranged'): props.append(f"ranged {it['range'] * 5} ft")
    elif it['type'] == 'weapon': props.append(f"reach {it.get('range', 1) * 5} ft")
    if it.get('twoHanded'): props.append('two-handed')
    if it.get('ability') == 'finesse': props.append('finesse')
    if it.get('magic'): props.append('magic')
    if it.get('weird'): props.append('weird')
    if it.get('cursed'): props.append('cursed')
    if it.get('bundle'): props.append(f"comes in {it['bundle']}s")
    bonus = []
    if it.get('extra'): bonus.append(f"+{dice(it['extra'][:2])} {it['extra'][2]}")
    if it.get('undeadBane'): bonus.append(f"+{dice(it['undeadBane'][:2])} {it['undeadBane'][2]} vs undead")
    if it.get('lifesteal'): bonus.append(f"heals {int(it['lifesteal'] * 100)}% of damage")
    defn = ''
    if it['type'] == 'armor': defn = f"AC {it['ac']} + DEX" + (f" (max +{it['maxDex']})" if it['maxDex'] < 20 else '')
    elif it['type'] == 'shield': defn = f"+{it['ac']} AC"
    elif it.get('acBonus'): defn = f"+{it['acBonus']} AC"
    elif it.get('heal'): defn = f"heals {dice(it['heal'])}"
    elif it.get('mana'): defn = f"restores {dice(it['mana'])} mana"
    elif it.get('perception'): defn = f"+{it['perception']} Perception"
    on = it.get('onHit')
    onTxt = f"{STATUS[on['status']]['name']} {on['rounds']} rd" + (f" ({int(on.get('chance', 1) * 100)}%)" if on.get('chance', 1) < 1 else '') if on else ''
    note = it.get('note', '') + (' ' + it['curseNote'] if it.get('curseNote') else '')
    ws.append(['', it['name'], k, TYPE.get(it['type'], it['type']), dice(it.get('dice')) + (f" {it['dmgType']}" if it.get('dmgType') else ''), '; '.join(bonus), ', '.join(props), defn, onTxt, note,
               '; '.join((['Starting gear'] if k in STARTING else []) + sorted(found[k]))])
    add_image(ws, f'A{ws.max_row}', IMG['items'][k])
style_rows(ws, height=96)

ws = sheet(wb, 'Monsters & props', ['Picture', 'Name', 'Key', 'Editor letter', 'Kind', 'HP', 'AC', 'Speed (ft)', 'Attack bonus', 'Damage', 'Reach / range', 'XP', 'On-hit effect', 'Special', 'Loot', 'Appears in'],
           [18, 22, 12, 9, 9, 7, 6, 9, 9, 14, 12, 8, 20, 36, 40, 40])
order = sorted(MONSTERS, key=lambda t: (MONSTERS[t].get('object', False), MONSTERS[t].get('boss', False), MONSTERS[t]['hp']))
for t in order:
    m = MONSTERS[t]
    kind = 'Prop' if m.get('object') else 'Boss' if m.get('boss') else 'Training' if m.get('ai') == 'none' else 'Monster'
    special = []
    if m.get('epithet'): special.append(m['epithet'])
    if m.get('ai') == 'ranged': special.append('ranged' + (' (grave-light bolts)' if m.get('proj') == 'bolt' else ' (arrows)'))
    if m.get('summon'): special.append(f"summons {m['summon'] if isinstance(m['summon'], str) else 'skeleton'}s every 3rd turn")
    if m.get('blessAllies'): special.append('blesses allies and wards itself every 3rd turn')
    if m.get('float'): special.append('floats')
    if t in D['UNDEAD']: special.append('undead (Dawnbringer bonus)')
    if t == 'keg': special.append('explodes for 3d6 fire around it')
    if m.get('object'): special.append('blocks movement until smashed; spills loot')
    if m.get('respawn'): special.append('props itself back up each round')
    if t == 'skeleton': special.append("letter 'b' places one disguised as a bone pile")
    on = m.get('onHit')
    onTxt = f"{STATUS[on['status']]['name']} {on['rounds']} rd" + (f" ({int(on.get('chance', 1) * 100)}%)" if on.get('chance', 1) < 1 else '') if on else ''
    loot = '; '.join((f"{e['gold'][0]}–{e['gold'][1]} gp" if e.get('gold') else f"{ITEMS[e['item']]['name']} ({int(round(e['p'] * 100))}%)") for e in LOOT.get(t, []))
    seen = '; '.join(f'{k} ×{v}' for k, v in appears[t].items())
    ws.append(['', m['name'], t, ', '.join(CHAR_OF[t]), kind, m['hp'], m['ac'], (m.get('speed') or 0) * 5, m.get('atk', ''),
               (dice(m['dmg']) + f" {m.get('dmgType', '')}") if m.get('dmg') else '', (f"{m['range'] * 5} ft" if m.get('range') else ''), m['xp'], onTxt, '; '.join(special), loot, seen])
    add_image(ws, f'A{ws.max_row}', IMG['monsters'][t])
style_rows(ws, height=96)
wb.save(os.path.join(out_dir, 'items-and-monsters.xlsx'))
print('wrote', os.path.join(out_dir, 'stats-and-rules.xlsx'), 'and', os.path.join(out_dir, 'items-and-monsters.xlsx'))
