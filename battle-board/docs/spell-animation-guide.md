# Spell animation build guide

This guide is for the **Code** mode of the Spell Forge. In Code mode you write the cast animation of a spell yourself, in JavaScript, with a small toolkit called `fx`. The rules of the spell (damage, saves, effects) stay in the forge's form; your code only decides what it looks like and *when* it lands.

Open it from the title screen: **Spell Forge → How it looks → Code (JavaScript)**. The **? Build guide** button shows a short version of this page inside the game.

## How it runs

Each time the spell is cast, your code runs once as the body of an `async` function. It is given one object, `fx`. You can use `await` anywhere.

```js
// the smallest useful animation
await fx.move(fx.from, fx.to, {}, p => fx.particle({ at: p, life: .3 }));  // a dot flies to the target
fx.hit();                                                                   // the spell lands
fx.burst(40, () => ({ at: fx.to, vel: fx.direction(), life: .5 }));        // and sparks fly out
```

**`fx.hit()` is the moment the spell lands.** Damage, healing and effects are rolled then, and the game waits for it before the next turn. Call it once, at the moment your animation "connects". If you never call it, the spell lands when your code finishes, or after 6 seconds at the latest. Anything you start after `fx.hit()` keeps playing while the game carries on.

## Where things are

The board uses one unit per square (5 ft). `y` is up. The floor is at about `y = 0`; your hand is about 1 unit up.

| Name | What it is |
|---|---|
| `fx.from` | Your hand, as `{ x, y, z }`. |
| `fx.to` | Where the spell lands: the target's chest for one target, a little above the floor for an area. |
| `fx.center` | The middle of the area (the same as `fx.to` for one target). |
| `fx.tiles` | Every square of the area, as points just above the floor. One point for a single target. |
| `fx.area` | `true` for an area spell. |
| `fx.color`, `fx.color2` | The two colours chosen under the code box. |
| `fx.size`, `fx.speed`, `fx.amount` | The three sliders, as multipliers (1 is normal). |
| `fx.picture` | `true` when particles use your card picture or pixel art. |

## The toolkit

| Call | What it does |
|---|---|
| `fx.particle(options)` | Makes one particle. Options are below. |
| `fx.burst(n, (i, total) => options)` | Makes `n` particles at once. `n` is multiplied by the Amount slider and the quality setting. |
| `await fx.every(seconds, (t, k, dt) => { … })` | Calls your function every frame for `seconds` (at most 10). `t` is the time so far, `k` goes from 0 to 1, `dt` is the frame time. |
| `await fx.move(a, b, { time, arc, ease }, p => { … })` | Moves a point from `a` to `b`, calling you with its position every frame. `time` defaults to a speed based on distance and the Speed slider; `arc` lifts the middle of the path (0 is straight); `ease` is `'in'` (speeds up) or `'out'` (slows down). |
| `await fx.wait(seconds)` | Pauses your code. |
| `fx.hit()` | The spell lands now. |
| `fx.light(color, strength, seconds, at)` | A flash of light that fades out. Strength 10 is a candle-bright flash, 40 is blinding. |
| `fx.shake(amount)` | Shakes the camera, 0 to 0.6. |
| `await fx.travel(kind)` | One of the forge's built-in travel styles: `'orb'`, `'arc'`, `'beam'`, `'rain'`, `'none'`. |
| `fx.impact(kind)` | One of the built-in impacts: `'sparks'`, `'explosion'`, `'cloud'`, `'pillar'`, `'ring'`, `'swirl'`, `'shards'`. |
| `fx.random(a, b)` | A random number between `a` and `b`. |
| `fx.direction()` | A random direction, length 1. Multiply it for speed. |
| `fx.mix(a, b, k)` | The point `k` of the way from `a` to `b`. |
| `fx.add(a, b)`, `fx.scale(a, k)`, `fx.distance(a, b)` | Point arithmetic. |

### Particle options

| Option | Meaning | Typical |
|---|---|---|
| `at` | Where it starts: `{ x, y, z }` or `[x, y, z]`. | `fx.to` |
| `vel` | Velocity, in units per second. | `[0, 1, 0]` rises |
| `life` | Seconds it lives (up to 8). | `0.3` to `1` |
| `size` | A number, or `[start, end]` to grow or shrink. Multiplied by the Size slider. | `0.1` spark, `0.5` puff |
| `color`, `color2` | Start and end colour. Default: `fx.color` and `fx.color2`. | `'#ff8a3a'` |
| `alpha` | Opacity, 0 to 1. | `1` |
| `drag` | Slows it down over time. | `0` to `2` |
| `gravity` | Pull up or down. | `-9` falls like a stone |
| `wobble` | Drifts sideways like smoke. | `1` |
| `bounce` | `true` bounces off the floor. | |
| `smoke` | `true` makes a soft, non-glowing puff (good for dust and clouds). | |
| `fadeIn` | Share of its life spent fading in. | `0.08` |

Glowing particles add light to whatever is behind them, so they look brightest on dark floors. Colours fade from `color` to `color2` over the particle's life.

## Worked examples

### 1. A bolt with a trail

```js
await fx.move(fx.from, fx.to, { arc: 0.25 }, p => {
  // three sparks every frame, drifting a little, so the path leaves a trail
  fx.burst(3, () => ({ at: p, vel: [fx.random(-.2, .2), fx.random(-.1, .3), fx.random(-.2, .2)], life: fx.random(.25, .5), size: [.1, .01] }));
});
fx.hit();
fx.burst(50, () => {
  const d = fx.direction(), s = fx.random(.5, 2.5) * fx.speed;   // random direction, random speed
  return { at: fx.to, vel: [d.x * s, d.y * s, d.z * s], life: fx.random(.3, .7), size: [.09, .01] };
});
fx.light(fx.color, 12, 0.5, fx.to);
```

The pattern to remember: **move, hit, burst**. Most spells are a variation of it.

### 2. Something that falls from the sky (an area spell)

```js
for (let i = 0; i < 6; i++) {
  const spot = fx.tiles[Math.floor(Math.random() * fx.tiles.length)];   // a random square of the area
  const sky = { x: spot.x, y: spot.y + 6, z: spot.z };
  fx.move(sky, spot, { time: 0.45, arc: 0, ease: 'in' }, p => fx.particle({ at: p, life: .35, size: [.18, .02] }))
    .then(() => fx.burst(40, () => ({ at: spot, vel: fx.scale(fx.direction(), 2.5), life: .5, size: [.14, .02], drag: 1.5 })));
  await fx.wait(0.12);   // the next meteor starts a moment later
}
await fx.wait(0.5);
fx.hit();
```

Leaving out `await` before `fx.move` starts the meteors overlapping instead of one after another.

### 3. Something that lasts (a whirl)

```js
await fx.every(1.0, (t, k) => {
  fx.burst(5, () => {
    const a = Math.random() * Math.PI * 2, r = 1.6 * (1 - k * 0.5);   // the circle shrinks as k goes 0 → 1
    const at = { x: fx.to.x + Math.cos(a) * r, y: fx.to.y, z: fx.to.z + Math.sin(a) * r };
    return { at, vel: [-Math.sin(a) * 2 - Math.cos(a) * 1.5, .3, Math.cos(a) * 2 - Math.sin(a) * 1.5], life: .5, size: [.08, .02] };
  });
});
fx.hit();
```

`(-sin a, cos a)` points around the circle; `(-cos a, -sin a)` points to its middle. Mixing the two makes a spiral.

### 4. Using your picture

Upload a picture or draw pixel art under **Card art**, then set **Particles** to **Your card picture**. Every particle you make now draws that picture. Larger sizes (0.3 to 0.5) show it best:

```js
fx.hit();
fx.burst(40, () => ({ at: fx.to, vel: [fx.random(-2, 2), fx.random(3, 6), fx.random(-2, 2)], life: 1.4, size: [.3, .25], gravity: -9, bounce: true }));
```

Tick **tint** to colour the picture with `fx.color`.

## The library

**Load from library** replaces your code with one of these. Each is commented; the best way to learn is to load one, cast it, and change one number at a time.

| Animation | Shows how to |
|---|---|
| Fire Bolt | move a point with a trail, then burst |
| Fireball | lob with a high arc and `ease: 'in'`, explode, add smoke and a shake |
| Ray of Frost | fill a line instantly with `fx.mix`, then bouncing shards with gravity |
| Chain Lightning | build a jagged path from points and flicker it |
| Meteor Shower | many projectiles over an area, overlapping in time |
| Vortex | a timed effect with `fx.every` and spiral velocities |
| Healing Fountain | particles that rise and fall back under gravity |
| Shockwave | rings that spread across the floor, one after another |
| Black Hole | particles that start outside and fly inward, then a flash |
| Picture Confetti | throwing your own picture |
| Spirit Wisps | several projectiles with different arcs, landing together |

**From my settings** writes out what the Settings mode would do (`fx.travel(…)`, `fx.hit()`, `fx.impact(…)`) so you can start from that.

## Limits and errors

- At most **6000 particles** per cast, and at most **10 seconds** for one `fx.every` or `fx.move`.
- The spell **always lands** within 6 seconds, even if the code never calls `fx.hit()` or gets stuck waiting.
- If your code throws an error, the message appears under the code box (and as a toast in a dungeon), and the spell still lands with no animation.
- Lower quality settings make fewer particles from `fx.burst`; single `fx.particle` calls are not reduced.

## Safety

Your code runs in your own browser with full access to the game page, like code pasted into the browser console. That is fine for spells you write yourself. **Only paste code you trust.** Forged spells are stored in this browser only and are not shared with anyone. If spells are ever shared between players, the code will need a proper sandbox first.

## Tips

- Use `fx.speed` in your own timings (`time: 0.5 / fx.speed`) so the Speed slider keeps working.
- Short lives (0.2 to 0.6 s) and many small particles look crisper than a few big ones.
- `drag` makes bursts look heavy and quick to settle; `wobble` makes smoke drift.
- Put the flash (`fx.light`) and the shake at the same moment as `fx.hit()`, so the hit feels solid.
- For healing and buffs, call `fx.hit()` early and let the sparkles keep going afterwards.
