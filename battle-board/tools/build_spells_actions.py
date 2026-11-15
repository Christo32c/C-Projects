"""Builds docs/spells-and-actions.xlsx: every spell, attack, technique and action, with its card picture,
a damage breakdown and how your stats change it. The numbers are live formulas tied to the "Your hero" sheet.

    node tests/run-tests.mjs --catalog catalog.json        (dumps the game's data tables)
    node <render script> cards/                            (one PNG per card, named s-<spell>, t-<tech>, <action>, atk-<kit>)
    python3 tools/build_spells_actions.py catalog.json cards/ docs/
"""
import io, json, os, sys
from openpyxl import Workbook
from openpyxl.comments import Comment
from openpyxl.drawing.image import Image as XLImage
from openpyxl.styles import Alignment, Border, Font, PatternFill, Side
from openpyxl.utils import get_column_letter
from openpyxl.workbook.defined_name import DefinedName
from openpyxl.worksheet.datavalidation import DataValidation
from openpyxl.formatting.rule import CellIsRule
from PIL import Image as PILImage

cat = json.load(open(sys.argv[1]))
CARDS = sys.argv[2]
out_dir = sys.argv[3] if len(sys.argv) > 3 else 'docs'
D = cat['data']
SPELLS, STATUS, ITEMS, TECHS, KITS = D['SPELLS'], D['STATUS'], D['ITEMS'], D['TECHS'], D['KITS']
ORDER = ['firebolt', 'frostray', 'hex', 'bless', 'healword', 'ward', 'vines', 'enfeeble', 'empower', 'poison', 'haste', 'firewall', 'icewall', 'regen', 'fireball', 'hold']
ORDER += [k for k in SPELLS if k not in ORDER]

FONT = 'Arial'
HEAD = PatternFill('solid', fgColor='2B241D')
SUB = PatternFill('solid', fgColor='EFE7D8')
INPUT = PatternFill('solid', fgColor='FFFF00')
thin = Side(style='thin', color='CFC6B8')
BORDER = Border(left=thin, right=thin, top=thin, bottom=thin)
BLUE = Font(name=FONT, size=10, color='0000FF')
GREEN = Font(name=FONT, size=10, color='008000')
WRAP = Alignment(wrap_text=True, vertical='top')
CENTER = Alignment(horizontal='center', vertical='center', wrap_text=True)
PCT = '0%'
NUM = '0.0'

wb = Workbook()


def name(n, ref):
    wb.defined_names[n] = DefinedName(n, attr_text=ref)


def header(ws, row, heads, widths=None):
    for i, h in enumerate(heads, start=1):
        c = ws.cell(row=row, column=i, value=h)
        c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10); c.fill = HEAD; c.alignment = CENTER; c.border = BORDER
    if widths:
        for i, w in enumerate(widths, start=1): ws.column_dimensions[get_column_letter(i)].width = w
    ws.row_dimensions[row].height = 30
    ws.freeze_panes = f'C{row + 1}'


def body(ws, r0, r1, ncols, height=None):
    for r in range(r0, r1 + 1):
        for c in range(1, ncols + 1):
            cell = ws.cell(row=r, column=c)
            if not (cell.font and cell.font.color and cell.font.color.rgb in ('FF0000FF', 'FF008000')):
                cell.font = Font(name=FONT, size=10, bold=(c == 2))
            cell.alignment = WRAP if c > 1 else CENTER
            cell.border = BORDER
        if height: ws.row_dimensions[r].height = height


def picture(ws, cell, file, w=112):
    p = os.path.join(CARDS, file + '.png')
    if not os.path.exists(p): return False
    im = PILImage.open(p).convert('RGB'); h = round(im.height * w / im.width)
    im = im.resize((w * 2, h * 2), PILImage.LANCZOS); buf = io.BytesIO(); im.save(buf, 'PNG'); buf.seek(0)
    x = XLImage(buf); x.width, x.height = w, h; ws.add_image(x, cell)
    return True


def note(ws, row, text, col=1, italic=True, bold=False, size=10):
    c = ws.cell(row=row, column=col, value=text); c.font = Font(name=FONT, size=size, italic=italic, bold=bold); c.alignment = Alignment(wrap_text=False, vertical='top')
    return c


# ============================================================ Your hero (inputs and derived numbers)
ws = wb.active; ws.title = 'Your hero'
ws.column_dimensions['A'].width = 30; ws.column_dimensions['B'].width = 16; ws.column_dimensions['C'].width = 14; ws.column_dimensions['D'].width = 70
note(ws, 1, 'Battle Board: spells and actions', italic=False, bold=True, size=14)
note(ws, 2, 'Change the yellow cells to your hero. Every number on the other sheets follows them. Blue text is a value you typed; black is worked out.')
note(ws, 3, 'The example below is a level 1 Spellblade with a longsword, chain mail and shield (the kit\'s starting scores), facing a target with Defence 10 and a +1 save.')

kit = KITS['spellblade']['scores']
rows = [('Strength', 'str'), ('Dexterity', 'dex'), ('Constitution', 'con'), ('Intelligence', 'int'), ('Wisdom', 'wis'), ('Charisma', 'cha')]
for i, h in enumerate(['Ability', 'Score', 'Modifier', 'What it does here'], start=1):
    c = ws.cell(row=5, column=i, value=h); c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10); c.fill = HEAD; c.border = BORDER
WHAT = {'str': 'Hit and damage with Strength weapons (longsword, mace, greatswords). Shield Bash damage.',
        'dex': 'Hit and damage with bows and finesse weapons (dagger, eel-skin whip). Defence in light armour.',
        'con': 'Hit points.',
        'int': 'Spell attack, spell save DC, healing and maximum mana when Intelligence is your casting ability (Spellblade).',
        'wis': 'Perception (Search). Spell attack, DC, healing and mana when Wisdom is your casting ability (Warden, Ranger).',
        'cha': 'Talents only (Lucky, Inspiring Presence and others).'}
for i, (n, k) in enumerate(rows):
    r = 6 + i
    ws.cell(row=r, column=1, value=n)
    c = ws.cell(row=r, column=2, value=kit[k]); c.fill = INPUT; c.font = BLUE
    ws.cell(row=r, column=3, value=f'=INT((B{r}-10)/2)')
    ws.cell(row=r, column=4, value=WHAT[k])
    name(k.capitalize() + 'Mod', f"'Your hero'!$C${r}")
    name(k.capitalize() + 'Score', f"'Your hero'!$B${r}")
body(ws, 6, 11, 4)
for r in range(6, 12): ws.cell(row=r, column=2).font = BLUE; ws.cell(row=r, column=2).fill = INPUT
ws.cell(row=6, column=2).comment = Comment('Example: the Spellblade kit\'s suggested scores. Type your own.', 'Battle Board')

# choices
weapons = [k for k, v in ITEMS.items() if v['type'] == 'weapon']
inputs = [
    ('Level', 1, 'Level', 'Proficiency, mana, Second Wind.'),
    ('Casting ability', 'INT', 'CastAbil', 'INT for the Spellblade, WIS for the Warden and Ranger.'),
    ('Kit', 'Spellblade', 'Kit', 'Warden: +2 to hit and +2 damage with melee weapons. Ranger: +2 to hit and +1 damage with bows.'),
    ('Weapon in hand', ITEMS['longsword']['name'], 'Weapon', 'Pick from the list (Weapons sheet).'),
    ('Blessed right now?', 'No', 'BlessedYN', 'Bless: +2 to attack rolls.'),
    ('Target Defence', 10, 'TargetDef', 'Giant Rat 7, Skeleton 9, Goblin 11, Spider 11, Grave Warden 14. See the monsters workbook.'),
    ('Target save bonus', 1, 'TargetSave', 'Most monsters have -2 to +3 on a save.'),
    ('Trap and secret DC', 13, 'SearchDC', 'Every trap, secret door and hidden cache in the built-in dungeons is DC 13.'),
]
r0 = 13
for i, h in enumerate(['Choice', 'Value', '', 'Notes'], start=1):
    c = ws.cell(row=r0, column=i, value=h); c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10); c.fill = HEAD; c.border = BORDER
for i, (label, val, nm, nt) in enumerate(inputs):
    r = r0 + 1 + i
    ws.cell(row=r, column=1, value=label); c = ws.cell(row=r, column=2, value=val); c.fill = INPUT; c.font = BLUE
    ws.cell(row=r, column=4, value=nt); name(nm, f"'Your hero'!$B${r}")
body(ws, r0 + 1, r0 + len(inputs), 4)
for i in range(len(inputs)): c = ws.cell(row=r0 + 1 + i, column=2); c.fill = INPUT; c.font = BLUE
dv = DataValidation(type='list', formula1='"STR,DEX,CON,INT,WIS,CHA"', allow_blank=False); ws.add_data_validation(dv); dv.add(f'B{r0 + 2}')
dv = DataValidation(type='list', formula1='"Spellblade,Warden,Ranger,None"'); ws.add_data_validation(dv); dv.add(f'B{r0 + 3}')
dv = DataValidation(type='list', formula1="=Weapons!$A$2:$A$" + str(len(weapons) + 1)); ws.add_data_validation(dv); dv.add(f'B{r0 + 4}')
dv = DataValidation(type='list', formula1='"Yes,No"'); ws.add_data_validation(dv); dv.add(f'B{r0 + 5}')

# talents
TAL = [('efficient', 'Efficient Casting', 'Spells cost 1 less mana (never less than 1).'), ('mastery', 'Elemental Mastery', '+3 damage on every damaging spell.'),
       ('lingering', 'Lingering Magic', 'Buffs and curses from your spells last 1 round longer.'), ('spellSniper', 'Spell Sniper', '+2 to spell attacks; spells reach 20 ft further.'),
       ('reservoir', 'Arcane Reservoir', '+6 maximum mana.'), ('healer', 'Healer', 'Potions and healing spells restore 4 more HP.'),
       ('manaSpring', 'Mana Spring', 'Potions of Mana restore twice as much.'), ('keenSenses', 'Keen Senses', '+3 to Perception and searches.'),
       ('heavyHitter', 'Heavy Hitter', '+2 damage with melee weapons.'), ('brute', 'Brute', 'Melee attacks crit on 19 or 20.'),
       ('ironGrip', 'Iron Grip', 'Two-handed weapons deal an extra 1d4.'), ('sharpshooter', 'Sharpshooter', '+2 to hit with ranged weapons; bows reach 20 ft further.'),
       ('quickstep', 'Quickstep', '+10 ft of movement every turn.')]
t0 = r0 + len(inputs) + 2
for i, h in enumerate(['Talent (Yes or No)', 'Have it?', '1 = yes', 'Effect'], start=1):
    c = ws.cell(row=t0, column=i, value=h); c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10); c.fill = HEAD; c.border = BORDER
dv = DataValidation(type='list', formula1='"Yes,No"'); ws.add_data_validation(dv)
for i, (k, n, d) in enumerate(TAL):
    r = t0 + 1 + i
    ws.cell(row=r, column=1, value=n); c = ws.cell(row=r, column=2, value='No'); dv.add(f'B{r}')
    ws.cell(row=r, column=3, value=f'=IF(B{r}="Yes",1,0)'); ws.cell(row=r, column=4, value=d)
    name('T_' + k, f"'Your hero'!$C${r}")
body(ws, t0 + 1, t0 + len(TAL), 4)
for i in range(len(TAL)): c = ws.cell(row=t0 + 1 + i, column=2); c.fill = INPUT; c.font = BLUE

# derived
d0 = t0 + len(TAL) + 2
for i, h in enumerate(['Worked out', 'Value', '', 'Formula in the game'], start=1):
    c = ws.cell(row=d0, column=i, value=h); c.font = Font(name=FONT, bold=True, color='FFFFFF', size=10); c.fill = HEAD; c.border = BORDER
wrow = "MATCH(Weapon,Weapons!$A$2:$A$100,0)"
DER = [
    ('Proficiency bonus', '=2+INT((Level-1)/4)', 'Prof', '2 + one more every 4 levels.'),
    ('Casting modifier', '=INDEX($C$6:$C$11,MATCH(CastAbil,{"STR","DEX","CON","INT","WIS","CHA"},0))', 'CastMod', 'The modifier of your casting ability.'),
    ('Blessed (1 = yes)', '=IF(BlessedYN="Yes",1,0)', 'Blessed', ''),
    ('Spell attack bonus', '=Prof+CastMod+2*Blessed+2*T_spellSniper', 'SpellAtk', 'Proficiency + casting modifier (+2 Bless, +2 Spell Sniper). Rolled against the target\'s Defence.'),
    ('Spell save DC', '=8+Prof+CastMod', 'SpellDC', '8 + proficiency + casting modifier. The target rolls d20 + its save bonus and resists on a total at or above this.'),
    ('Maximum mana', '=6+4*Level+2*MAX(0,CastMod)+6*T_reservoir', 'MaxMana', '6 + 4 per level + 2 × casting modifier (never less) + 6 with Arcane Reservoir.'),
    ('Weapon dice (count)', f'=INDEX(Weapons!$C$2:$C$100,{wrow})', 'WDiceN', ''),
    ('Weapon dice (sides)', f'=INDEX(Weapons!$D$2:$D$100,{wrow})', 'WDiceS', ''),
    ('Weapon uses', f'=INDEX(Weapons!$E$2:$E$100,{wrow})', 'WAbil', 'str, dex, or finesse (the better of Strength and Dexterity).'),
    ('Ranged weapon (1 = yes)', f'=IF(INDEX(Weapons!$F$2:$F$100,{wrow})="Yes",1,0)', 'WRanged', ''),
    ('Two-handed (1 = yes)', f'=IF(INDEX(Weapons!$J$2:$J$100,{wrow})="Yes",1,0)', 'WTwoH', ''),
    ('Weapon extra dice (average)', f'=INDEX(Weapons!$H$2:$H$100,{wrow})*(INDEX(Weapons!$I$2:$I$100,{wrow})+1)/2', 'WExtraAvg', 'Enchanted blades add elemental dice on every hit.'),
    ('Weapon ability modifier', '=IF(WAbil="finesse",MAX(StrMod,DexMod),IF(WAbil="dex",DexMod,StrMod))', 'WAbilMod', ''),
    ('Martial training: to hit', '=IF(AND(Kit="Warden",WRanged=0),2,IF(AND(Kit="Ranger",WRanged=1),2,0))', 'MartialHit', 'Warden with a melee weapon, or Ranger with a bow.'),
    ('Martial training: damage', '=IF(AND(Kit="Warden",WRanged=0),2,IF(AND(Kit="Ranger",WRanged=1),1,0))', 'MartialDmg', ''),
    ('Weapon attack bonus', '=WAbilMod+Prof+2*Blessed+2*T_sharpshooter*WRanged+MartialHit', 'WpnAtk', 'Weapon ability modifier + proficiency + training (+2 Bless, +2 Sharpshooter with a bow).'),
    ('Weapon damage bonus', '=WAbilMod+MartialDmg+2*T_heavyHitter*(1-WRanged)', 'DmgMod', 'Weapon ability modifier + training (+2 Heavy Hitter in melee). Added once per hit, not per die.'),
    ('Weapon dice average', '=WDiceN*(WDiceS+1)/2', 'WDiceAvg', 'One die averages (sides + 1) ÷ 2.'),
    ('Average weapon hit', '=MAX(1,WDiceAvg+DmgMod)+WExtraAvg+2.5*T_ironGrip*WTwoH*(1-WRanged)', 'WHitAvg', 'Dice + damage bonus + enchantment (+1d4 Iron Grip with a two-handed melee weapon).'),
    ('Chance a weapon attack hits', '=MIN(0.95,MAX(0.05,(21-(TargetDef-WpnAtk))/20))', 'WHitP', 'd20 + attack bonus ≥ Defence. A 1 always misses, a 20 always hits (5% to 95%).'),
    ('Critical chance', '=IF(AND(T_brute=1,WRanged=0),0.1,0.05)', 'CritP', 'A 20 (19 or 20 with Brute in melee) is a critical hit: the dice are rolled twice.'),
    ('Chance a spell attack hits', '=MIN(0.95,MAX(0.05,(21-(TargetDef-SpellAtk))/20))', 'SpellHitP', 'Same rule as weapons, with your spell attack bonus.'),
    ('Chance the target fails a save', '=1-MIN(1,MAX(0,(21-(SpellDC-TargetSave))/20))', 'SaveFailP', 'The target resists on d20 + save bonus ≥ your DC. Saves have no automatic 1 or 20.'),
    ('Perception (Search bonus)', '=WisMod+Prof+3*T_keenSenses', 'Perception', 'Wisdom modifier + proficiency (+3 Keen Senses, plus any amulet).'),
    ('Movement per turn (ft)', '=30+10*T_quickstep', 'Speed', '30 ft (+10 Quickstep). Carrying too much takes 10 ft off.'),
]
for i, (label, f, nm, nt) in enumerate(DER):
    r = d0 + 1 + i
    ws.cell(row=r, column=1, value=label); c = ws.cell(row=r, column=2, value=f)
    if 'P' == nm[-1] and nm.endswith('P'): c.number_format = PCT
    if nm in ('WExtraAvg', 'WDiceAvg', 'WHitAvg'): c.number_format = NUM
    ws.cell(row=r, column=4, value=nt); name(nm, f"'Your hero'!$B${r}")
body(ws, d0 + 1, d0 + len(DER), 4)
ws.freeze_panes = None

# ============================================================ Weapons (lookup)
wsW = wb.create_sheet('Weapons')
header(wsW, 1, ['Weapon', 'Key', 'Dice', 'Sides', 'Uses', 'Ranged', 'Range (ft)', 'Extra dice', 'Extra sides', 'Two-handed', 'Extra damage type', 'Average hit before bonuses'],
       [24, 12, 7, 7, 9, 8, 10, 9, 9, 10, 14, 16])
for i, k in enumerate(weapons, start=2):
    w = ITEMS[k]; ex = w.get('extra') or [0, 0, '']
    wsW.append([w['name'], k, w['dice'][0], w['dice'][1], w['ability'], 'Yes' if w.get('ranged') else 'No', w['range'] * 5, ex[0], ex[1], 'Yes' if w.get('twoHanded') else 'No', ex[2],
                f'=C{i}*(D{i}+1)/2+H{i}*(I{i}+1)/2'])
    wsW.cell(row=i, column=12).number_format = NUM
body(wsW, 2, wsW.max_row, 12)
wsW.freeze_panes = 'B2'

# ============================================================ Spells
wsS = wb.create_sheet('Spells')
H = ['Card', 'Spell', 'Learned at level', 'Base mana', 'Mana for you', 'Range for you (ft)', 'Area', 'Targets', 'How it lands', 'Dice', 'Sides', 'Damage type',
     'Average per target', 'Most per target', 'Chance it lands (your hero)', 'Expected per target', 'Effect', 'Effect rounds for you', 'Effect chance', 'How your stats change it', 'Description']
header(wsS, 1, H, [17, 18, 9, 8, 8, 10, 14, 10, 18, 6, 6, 10, 10, 10, 11, 11, 13, 9, 9, 50, 60])
r = 2
for k in ORDER:
    sp = SPELLS[k]
    dmg = sp.get('damage'); heal = sp.get('heal'); st = sp.get('status')
    how = 'Spell attack vs Defence' if sp.get('attack') else (f"{sp['save'].upper()} save vs your DC" if sp.get('save') else 'Automatic')
    tgt = {'enemy': 'An enemy', 'ally': 'A friend', 'area': 'Everyone in the area'}.get(sp.get('target'), sp.get('target', ''))
    if k in ('bless',): tgt = 'Friends in the area'
    if k == 'poison': tgt = 'Enemies in the area'
    dice = dmg or (heal[:2] if heal else None)
    if dmg:
        avg = f'=J{r}*(K{r}+1)/2+3*T_mastery'; mx = f'=J{r}*K{r}+3*T_mastery'
    elif heal:
        avg = f'=J{r}*(K{r}+1)/2+MAX(0,CastMod)+4*T_healer'; mx = f'=J{r}*K{r}+MAX(0,CastMod)+4*T_healer'
    else:
        avg = mx = ''
    land = '=SpellHitP' if sp.get('attack') else ('=SaveFailP' if sp.get('save') else 1)
    if sp.get('attack'): exp = f'=O{r}*M{r}+0.05*J{r}*(K{r}+1)/2'
    elif sp.get('save') and dmg: exp = f'=O{r}*M{r}+(1-O{r})*INT(M{r}/2)'
    elif heal: exp = f'=M{r}'
    else: exp = ''
    stats = []
    if sp.get('attack'): stats.append('Hit chance: d20 + spell attack (proficiency + casting modifier) against Defence.')
    if sp.get('save'): stats.append(f"The target resists with a {sp['save'].upper()} save against your DC (8 + proficiency + casting modifier)" + (', taking half damage.' if dmg else '.'))
    if dmg: stats.append('Damage dice are not changed by your scores. Elemental Mastery adds 3.')
    if heal: stats.append('Heals the dice + your casting modifier (never less than 0). Healer adds 4.')
    if st: stats.append('Lingering Magic adds a round to the effect.')
    stats.append('Spell Sniper adds 20 ft of range' + (' and +2 to hit.' if sp.get('attack') else '.'))
    stats.append('Efficient Casting costs 1 less mana (minimum 1).')
    if k in ('firewall', 'icewall'): stats.append('Wall damage rolls when it rises and again each round for creatures in or beside it (Wall of Fire also burns 2d6 if you walk through).')
    if k == 'vines': stats.append('Restrained foes can\'t move, and attacks against them roll twice and keep the better.')
    eff = STATUS[st[0]]['name'] if st else ('Restrained' if k == 'vines' else ('Blocks movement' if k == 'icewall' else ''))
    rounds = f'={st[1]}+T_lingering' if st else (f"={sp.get('duration')}" if sp.get('duration') else '')
    wsS.append(['', sp['name'], sp['unlock'], sp['cost'], f'=MAX(1,D{r}-T_efficient)', f"={sp['range']}*5+20*T_spellSniper", sp.get('area', ''), tgt, how,
                dice[0] if dice else '', dice[1] if dice else '', sp.get('dmgType', '') if dmg else ('healing' if heal else ''), avg, mx, land, exp, eff, rounds,
                st[2] if st else '', ' '.join(stats), sp['desc']])
    for col in (13, 14, 16): wsS.cell(row=r, column=col).number_format = NUM
    wsS.cell(row=r, column=15).number_format = PCT; wsS.cell(row=r, column=19).number_format = PCT
    for col in (4, 19): wsS.cell(row=r, column=col).font = BLUE
    wsS.cell(row=r, column=10).font = BLUE; wsS.cell(row=r, column=11).font = BLUE
    picture(wsS, f'A{r}', 's-' + k)
    r += 1
body(wsS, 2, r - 1, len(H), height=128)
for rr in range(2, r):
    for col in (4, 10, 11, 19): wsS.cell(row=rr, column=col).font = BLUE
note(wsS, r + 1, 'Average = dice × (sides + 1) ÷ 2. Expected per target weighs that by the chance it lands: spell attacks add 5% for a critical (dice rolled twice); saves still deal half when resisted.')
note(wsS, r + 2, 'Healing Word heals 2d4 + your casting-ability modifier. (The in-game card says "Intelligence modifier"; the game actually uses whichever ability you cast with.)')
note(wsS, r + 3, 'Blue numbers are the game\'s base values. Black numbers are worked out from the "Your hero" sheet.')

# ============================================================ Attacks and techniques
wsT = wb.create_sheet('Attacks & techniques')
H = ['Card', 'Name', 'Who', 'Level', 'Ready again after', 'Needs', 'Uses your action?', 'Attack bonus', 'Chance it hits', 'Damage dice on a hit', 'Average on a hit',
     'Expected per use', 'Extra', 'How your stats change it', 'Description']
header(wsT, 1, H, [17, 18, 16, 7, 12, 14, 12, 9, 10, 18, 10, 10, 30, 52, 52])
r = 2
dice_txt = '=WDiceN&"d"&WDiceS&IF(DmgMod<>0,TEXT(DmgMod," +0;-0"),"")&IF(WExtraAvg>0," + enchantment","")'
rows = []
# the basic attack, once for each kit's card
for kitk, kitname in (('spellblade', 'Spellblade'), ('warden', 'Warden'), ('ranger', 'Ranger')):
    w = ITEMS[KITS[kitk]['equipped']['weapon']]
    same = kitk == 'spellblade'
    rows.append(dict(img='atk-' + kitk, name=f'Attack ({w["name"]} card)' if kitk != 'spellblade' else 'Attack (your weapon)', who='Everyone' if kitk == 'spellblade' else kitname + ' card shown',
                     lvl=1, cd='Every turn', needs='A target in reach', act='Yes',
                     atk='=WpnAtk' if same else '', p='=WHitP' if same else '', dice=dice_txt if same else f'{w["dice"][0]}d{w["dice"][1]} + modifier', avg='=WHitAvg' if same else '', exp='=WHitP*WHitAvg+CritP*(WDiceAvg+WExtraAvg)' if same else '',
                     extra='Martial training for the Warden (melee) and Ranger (bows).' if kitk == 'spellblade' else f'The {kitname}\'s starting {w["name"].lower()}. To see its numbers, set Kit to {kitname} and the weapon to {w["name"]} on "Your hero".',
                     stats='To hit: d20 + weapon ability modifier + proficiency + training ≥ Defence. Damage: weapon dice + ability modifier + training. Finesse weapons use the better of Strength and Dexterity; bows use Dexterity. A 20 rolls the dice twice.',
                     desc='Strike with whatever is in your hand. Drag the card onto an enemy, or tap it, then tap one. Out of a fight your action comes straight back; in a fight it is spent.'))
TECH = {
    'cleave': dict(atk='=WpnAtk', p='=WHitP', dice=dice_txt, avg='=WHitAvg', exp='=WHitP*(WHitAvg+WDiceAvg)+CritP*WDiceAvg', act='Yes (with the attack)',
                   extra='=TEXT(WDiceAvg,"0.0")&" to each other enemy next to you, no roll"', stats='Main hit as a normal attack. The sweep deals only the weapon\'s dice (no modifier) to every other adjacent enemy. Expected assumes one extra enemy.'),
    'bash': dict(atk='=WpnAtk', p='=WHitP', dice='="1d4"&TEXT(DmgMod," +0;-0")', avg='=MAX(1,2.5+DmgMod)', exp='=WHitP*MAX(1,2.5+DmgMod)', act='Yes (with the attack)',
                 extra='Stunned: loses its next turn', stats='Uses your weapon attack bonus to hit. Damage is 1d4 + your weapon damage bonus (Strength for a mace or sword). Bosses can\'t be stunned again for 2 rounds.'),
    'wind': dict(atk='', p=1, dice='="1d10 + "&Level&" healing"', avg='=5.5+Level', exp='=5.5+Level', act='No',
                 extra='Once a fight', stats='Heals 1d10 + your level. No roll to hit, no action.'),
    'rend': dict(atk='=WpnAtk', p='=WHitP', dice='=(WDiceN+1)&"d"&WDiceS&IF(DmgMod<>0,TEXT(DmgMod," +0;-0"),"")', avg='=WHitAvg+(WDiceS+1)/2', exp='=WHitP*(WHitAvg+(WDiceS+1)/2+7.5)+CritP*(WDiceAvg+(WDiceS+1)/2)', act='Yes (with the attack)',
                 extra='Bleeding 3 rounds: 1d4 a round (7.5 on average, in Expected)', stats='One extra weapon die on the hit, then the target bleeds 1d4 at the start of each of its turns for 3 rounds.'),
    'guard': dict(atk='', p=1, dice='', avg='', exp='', act='Yes', extra='+4 Defence for 2 rounds', stats='Adds 4 to your Defence whatever your armour or Dexterity.'),
    'aimed': dict(atk='=WpnAtk', p='=1-(1-WHitP)^2', dice='=(WDiceN+1)&"d"&WDiceS&IF(DmgMod<>0,TEXT(DmgMod," +0;-0"),"")', avg='=WHitAvg+(WDiceS+1)/2', exp='=I{r}*K{r}+(1-(1-CritP)^2)*(WDiceAvg+(WDiceS+1)/2)', act='Yes (with the attack)',
                  extra='Roll twice, keep the better', stats='Advantage: the chance to hit becomes 1 − (chance to miss)². One extra weapon die.'),
    'tumble': dict(atk='', p=1, dice='', avg='', exp='', act='No', extra='+20 ft of movement this turn', stats='Not changed by your scores.'),
    'volley': dict(atk='=WpnAtk', p='=WHitP', dice=dice_txt, avg='=WHitAvg', exp='=WHitP*(WHitAvg+2*(WDiceAvg+1))+CritP*WDiceAvg', act='Yes (with the attack)',
                   extra='=" + up to 2 arrows of "&TEXT(WDiceAvg+1,"0.0")&" at enemies within 10 ft of the target, no roll"', stats='Main shot as a normal attack. Each extra arrow deals the weapon\'s dice + 1 to another visible enemy within 10 ft. Expected assumes two more enemies close by.'),
    'pin': dict(atk='=WpnAtk', p='=WHitP', dice=dice_txt, avg='=WHitAvg', exp='=WHitP*WHitAvg+CritP*WDiceAvg', act='Yes (with the attack)',
                extra='Stunned: loses its next turn', stats='A normal shot that stuns on a hit.'),
}
NEEDS = {'melee': 'A melee weapon', 'ranged': 'A bow', 'shield': 'A shield', 'fight': 'Being in a fight', 'any': 'Being in a fight'}
for k, T in TECHS.items():
    t = TECH[k]
    rows.append(dict(img='t-' + k, name=T['name'], who=', '.join(KITS[q]['cls'] for q in T['kits']), lvl=T['unlock'], cd=f"{T['cd']} of your turns" if T['cd'] else 'Once a fight',
                     needs=NEEDS.get(T['needs'], T['needs']), desc=T['desc'], **t))
for row in rows:
    exp = row['exp'].replace('{r}', str(r)) if isinstance(row['exp'], str) else row['exp']
    wsT.append(['', row['name'], row['who'], row['lvl'], row['cd'], row['needs'], row['act'], row['atk'], row['p'], row['dice'], row['avg'], exp, row['extra'], row['stats'], row['desc']])
    wsT.cell(row=r, column=9).number_format = PCT
    for col in (11, 12): wsT.cell(row=r, column=col).number_format = NUM
    wsT.cell(row=r, column=8).number_format = '+0;-0;0'
    picture(wsT, f'A{r}', row['img'])
    r += 1
body(wsT, 2, r - 1, len(H), height=128)
note(wsT, r + 1, 'Techniques cost no mana. Cooldowns count down at the start of your own turn, and everything is ready again when a fight ends. Most are armed first and ride on your next attack.')
note(wsT, r + 2, 'Expected per use = chance to hit × average on a hit, plus the critical chance × the extra dice a critical rolls. Enemies at Defence and save bonus from "Your hero".')

# ============================================================ Actions
wsA = wb.create_sheet('Actions')
H = ['Card', 'Action', 'Key', 'Costs', 'What it does', 'Numbers', 'Average', 'How your stats change it']
header(wsA, 1, H, [17, 20, 9, 18, 60, 22, 10, 56])
ACTS = [
    ('potion', 'Healing potion', 'Q', 'Your action in a fight', 'Drinks the weakest healing you carry: Goblin Stew, then Potion of Healing, then Greater Healing Potion.', 'Potion of Healing 2d4 + 2', '=7+4*T_healer', 'Not changed by your scores. Healer adds 4.'),
    (None, 'Greater Healing Potion', '', 'Your action in a fight', 'A stronger potion, used by the same card once the weaker ones are gone.', '4d4 + 4', '=14+4*T_healer', 'Healer adds 4.'),
    (None, 'Goblin Stew', '', 'Your action in a fight', 'Smells like regret. Used first by the healing card.', '1d4 + 1', '=3.5+4*T_healer', 'Healer adds 4.'),
    ('mana', 'Mana potion', 'E', 'Your action in a fight', 'Drinks a Potion of Mana. Mana only comes back from potions, camping and the Siphoning Charm.', '2d4 + 2 mana', '=7*(1+T_manaSpring)', 'Mana Spring doubles it.'),
    ('search', 'Search', 'F', 'Your action in a fight', 'A Perception check for traps, secret doors and hidden caches within 15 ft. Each is found if your total reaches its DC.', '="d20 "&TEXT(Perception,"+0;-0")&" vs DC "&SearchDC',
     '=MIN(1,MAX(0,(21-(SearchDC-Perception))/20))', 'Perception = Wisdom modifier + proficiency (+3 Keen Senses). Average shows your chance to find a DC-13 secret.'),
    ('dash', 'Dash', 'X', 'Your action', 'Doubles your movement this turn. Only matters in a fight.', '="+"&Speed&" ft"', '=Speed', 'Quickstep adds 10 ft. Being overloaded takes 10 ft off.'),
    ('sneak', 'Sneak', 'G', 'Free (toggle)', 'Monsters only notice you within 20 ft and fewer wanderers find you. Strike first while unseen for an ambush: every monster in the fight loses its first turn.', '20 ft notice range', '', 'Not changed by your scores.'),
    ('torch', 'Light a torch', 'click', 'Free', 'In a dark dungeon, see 10 ft further for the next 80 squares you walk.', '+10 ft sight, 80 squares', '', 'Not changed by your scores.'),
    ('fp', 'First person', 'B', 'Free (view)', 'See the dungeon through your hero\'s eyes. W and S step, A and D turn, drag to look.', '', '', ''),
    ('tac', 'Tactical view', 'Shift', 'Free (view)', 'Lift the camera overhead.', '', '', ''),
    (None, 'Move', 'click a square', 'Your movement', 'Walk up to your speed each turn in a fight. Difficult ground (water, vines, rubble) costs double. Out of a fight, walk freely.', '="Up to "&Speed&" ft"', '=Speed', 'Quickstep +10 ft; Haste +15 ft; Chilled halves it.'),
    (None, 'End turn / Pass a round', 'Space', 'Free', 'Ends your turn in a fight. Out of a fight, lets a round pass: walls of fire and ice run down and effects tick. It does not restore mana.', '', '', ''),
    (None, 'Open, pull, unlock', 'click it', 'Free', 'Doors, levers, plates, chests and portcullises. Walk up and click.', '', '', ''),
    (None, 'Search a body', 'click it', 'Free', 'Take the loot from a fallen monster.', '', '', ''),
    (None, 'Give an item', 'Inventory', 'Free', 'Hand an item to a party member standing next to you.', '', '', ''),
    (None, 'Make camp', 'Character sheet', 'Out of a fight only', 'Rest for full HP and mana and mend wounds, eating rations. Each camp on a floor is riskier: on a d6 roll at or below the risk, wanderers interrupt and you only get half.',
     'Risk: 2 on the first camp, +1 each time (max 5)', '=1-2/6', 'Not changed by your scores. Average shows the chance the first camp goes undisturbed.'),
]
r = 2
for img, n, key, cost, what, nums, avg, stats in ACTS:
    wsA.append(['' if img else 'no card', n, key, cost, what, nums, avg, stats])
    if img: picture(wsA, f'A{r}', img)
    if n in ('Search', 'Make camp'): wsA.cell(row=r, column=7).number_format = PCT
    else: wsA.cell(row=r, column=7).number_format = NUM
    r += 1
body(wsA, 2, r - 1, len(H))
for rr in range(2, r): wsA.row_dimensions[rr].height = 128 if wsA.cell(row=rr, column=1).value != 'no card' else 46
note(wsA, r + 1, 'Rows marked "no card" are things you do on the board or in the menus rather than from your hand.')

# ============================================================ Effects
wsE = wb.create_sheet('Effects')
header(wsE, 1, ['Icon', 'Effect', 'Kind', 'What it does', 'Average damage or healing each round', 'Caused by'], [7, 16, 9, 52, 16, 60])
DOT = {'burning': 3.5, 'bleeding': 2.5, 'poisoned': 2.5, 'regen': 3.5}
src = {}
for k in ORDER:
    sp = SPELLS[k]
    if sp.get('status'): src.setdefault(sp['status'][0], []).append(f"spell: {sp['name']}")
for k, n in (('bleeding', 'Rending Strike'), ('stunned', 'Shield Bash'), ('stunned', 'Pinning Shot'), ('shielded', 'Stand Fast')):
    src.setdefault(k, []).append('technique: ' + n)
for k, it in ITEMS.items():
    if it.get('onHit'): src.setdefault(it['onHit']['status'], []).append(f"{'arrow' if it['type'] == 'ammo' else 'weapon'}: {it['name']}")
for k, S in STATUS.items():
    wsE.append([S['icon'], S['name'], 'Debuff' if S.get('bad') else 'Buff', S['desc'], DOT.get(k, ''), '; '.join(src.get(k, []))])
body(wsE, 2, wsE.max_row, 6)
for rr in range(2, wsE.max_row + 1):
    wsE.cell(row=rr, column=1).font = Font(name='Segoe UI Symbol', size=14); wsE.cell(row=rr, column=1).alignment = CENTER
    wsE.cell(row=rr, column=5).number_format = NUM
note(wsE, wsE.max_row + 2, 'Damage and healing over time happen at the start of the bearer\'s turn; durations count down at the end of it. Every effect clears when the fight ends.')

out = os.path.join(out_dir, 'spells-and-actions.xlsx')
wb.save(out)
print('wrote', out)
