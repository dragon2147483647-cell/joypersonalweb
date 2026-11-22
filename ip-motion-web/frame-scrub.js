/*
 * Oil Motion — frame-scrub 运行时（circular 圆周注视）
 * 从 assets/interactive-motion.ts 的 createFrameAnimator / createCssSpriteRenderer 移植。
 * 职责：指针相对主体中心的角度 → 最短环形距离 → 阻尼限速 → 图集切帧。
 * 所有时间/几何控制都在这里，页面不维护第二份常量。
 */
(function (global) {
  'use strict';

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const wrap = (v, len) => ((v % len) + len) % len;

  // 环形最短距离：快速反向时走最近方向，不绕远路、不闪烁。
  function shortestCircularDelta(from, to, frameCount) {
    let delta = wrap(to, frameCount) - wrap(from, frameCount);
    if (delta > frameCount / 2) delta -= frameCount;
    if (delta < -frameCount / 2) delta += frameCount;
    return delta;
  }

  // 临界阻尼平滑（Unity SmoothDamp 移植）：及时响应但有最大速度上限，快速反向不抽动。
  function smoothDamp(current, target, velocity, smoothTime, maxSpeed, dt) {
    const st = Math.max(0.0001, smoothTime);
    const omega = 2 / st;
    const x = omega * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const originalTarget = target;
    const maxChange = maxSpeed * st;
    const change = clamp(current - target, -maxChange, maxChange);
    const limitedTarget = current - change;
    const temp = (velocity + omega * change) * dt;
    let nextVelocity = (velocity - omega * temp) * decay;
    let nextPosition = limitedTarget + (change + temp) * decay;
    if ((originalTarget - current > 0) === (nextPosition > originalTarget)) {
      nextPosition = originalTarget;
      nextVelocity = 0;
    }
    return [nextPosition, nextVelocity];
  }

  function createFrameAnimator(options) {
    const frameCount = Math.max(1, Math.floor(options.frameCount));
    const circular = options.circular !== false;
    const smoothTime = options.smoothTime ?? 0.09;      // 阻尼时间：越小越跟手
    const maxSpeed = options.maxSpeed ?? frameCount * 2.2; // 限速：帧/秒，防快速反向抽动
    const reducedMotion = !!options.reducedMotion;
    let position = clamp(options.initialFrame ?? 0, 0, frameCount - 1);
    let target = position;
    let velocity = 0;
    let lastFrame = -1;
    let lastTime = 0;
    let raf = 0;
    let destroyed = false;

    const normalize = (f) => circular ? wrap(f, frameCount) : clamp(f, 0, frameCount - 1);
    const render = () => {
      const frame = Math.round(normalize(position));
      if (frame !== lastFrame) {
        options.render(frame);
        lastFrame = frame;
      }
    };
    const loop = (now) => {
      raf = 0;
      if (destroyed) return;
      const dt = lastTime ? Math.min((now - lastTime) / 1000, 1 / 30) : 1 / 60;
      lastTime = now;
      if (reducedMotion) {
        position = target; velocity = 0;
      } else {
        [position, velocity] = smoothDamp(position, target, velocity, smoothTime, maxSpeed, dt);
      }
      render();
      if (Math.abs(target - position) > 0.002 || Math.abs(velocity) > 0.002) {
        raf = requestAnimationFrame(loop);
      } else if (circular) {
        position = wrap(position, frameCount);
        target = position;
      }
    };
    const schedule = () => { if (!raf && !destroyed) raf = requestAnimationFrame(loop); };
    render();
    return {
      setTarget(frame) {
        const n = normalize(frame);
        target = circular
          ? position + shortestCircularDelta(position, n, frameCount)
          : n;
        schedule();
      },
      // 指针方向映射：atan2(y,x) 相对起始角度归一化到 [0,1) 再映射到帧。
      setDirection(x, y, startAngle) {
        const start = startAngle ?? -Math.PI * 0.75;
        const angle = Math.atan2(y, x);
        const turn = Math.PI * 2;
        const normalized = ((angle - start + turn) % turn) / turn;
        this.setTarget(normalized * frameCount);
      },
      setProgress(p) { this.setTarget(clamp(p, 0, 1) * (frameCount - 1)); },
      getCurrentFrame() { return normalize(position); },
      destroy() { destroyed = true; if (raf) cancelAnimationFrame(raf); raf = 0; },
    };
  }

  // CSS 图集渲染器：只改 background-position，不创建/交叉淡化多张图。
  function createCssSpriteRenderer(element, columns, rows) {
    const cols = Math.max(1, Math.floor(columns));
    const rws = Math.max(1, Math.floor(rows));
    element.style.backgroundSize = `${cols * 100}% ${rws * 100}%`;
    return (frame) => {
      const column = frame % cols;
      const row = Math.floor(frame / cols);
      const x = cols === 1 ? 0 : (column / (cols - 1)) * 100;
      const y = rws === 1 ? 0 : (row / (rws - 1)) * 100;
      element.style.backgroundPosition = `${x}% ${y}%`;
    };
  }

  global.OilMotion = { createFrameAnimator, createCssSpriteRenderer, shortestCircularDelta };
})(window);
