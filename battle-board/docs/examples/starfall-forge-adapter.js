// ---- Starfall in the Spell Forge: paste the whole of starfallSpell.global.js above this line ----
const make = typeof createStarfall === 'function' ? createStarfall : window.createStarfall;
const { StarfallSpell } = make(fx.THREE);
const spell = new StarfallSpell(fx.scene, {
  tileSize: 1,
  diameter: 9,                                  // 9 squares across = the forge's 20 ft radius
  chargeTurns: 1,                               // a forge cast happens in one go
  groundY: fx.tileToWorld(fx.target).y,
  tileToWorld: t => fx.tileToWorld(t),
  worldToTile: v => fx.worldToTile(v),
  onImpact: () => fx.hit(),                     // damage lands when the stars do
  onShake: k => fx.shake(k * 0.4),
});
spell.timeScale = fx.speed;
const done = spell.cast(fx.caster, fx.target);
const running = fx.frame(dt => { spell.update(dt); return !['done', 'cancelled'].includes(spell.state); });
await fx.wait(0.9);                             // show the runes for a moment
spell.advanceTurn();                            // ...then release the star rain
await done;
await running;
spell.dispose();
