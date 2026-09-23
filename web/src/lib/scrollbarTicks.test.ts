import { describe, it, expect } from "vitest";
import { tickFraction } from "./scrollbarTicks";

describe("tickFraction", () => {
  it("matches the plain proportional position when the thumb isn't stretched", () => {
    // 10000px of content, 1000px viewport: the thumb is 100px, above the 24px minimum.
    const f = tickFraction({ contentCenter: 5500, scrollHeight: 10000, clientHeight: 1000, minThumb: 24 });
    expect(f).toBeCloseTo(0.55);
  });

  it("puts the tick at the thumb's center when its comment is centered on screen", () => {
    // Thumb stretched from 100px to 200px of a 1000px track, travelling 800px.
    // Centering y=5500 scrolls to 5000 of 9000, putting the thumb's top at 444.4.
    const f = tickFraction({ contentCenter: 5500, scrollHeight: 10000, clientHeight: 1000, minThumb: 200 });
    expect(f).toBeCloseTo((5000 / 9000 * 800 + 100) / 1000);
  });

  it("near the top, places the tick inside the thumb where the comment sits on screen", () => {
    // Can't scroll above 0: the comment sits 20% down the screen, so its
    // tick sits 20% down the 200px thumb.
    const f = tickFraction({ contentCenter: 200, scrollHeight: 10000, clientHeight: 1000, minThumb: 200 });
    expect(f).toBeCloseTo(0.04);
  });

  it("near the bottom, places the tick inside the thumb where the comment sits on screen", () => {
    // Max scroll is 9000: the comment is 90% down the screen, the thumb's top is at 800.
    const f = tickFraction({ contentCenter: 9900, scrollHeight: 10000, clientHeight: 1000, minThumb: 200 });
    expect(f).toBeCloseTo(0.98);
  });

  it("uses the plain position when nothing scrolls", () => {
    const f = tickFraction({ contentCenter: 300, scrollHeight: 1000, clientHeight: 1000, minThumb: 24 });
    expect(f).toBeCloseTo(0.3);
  });
});
