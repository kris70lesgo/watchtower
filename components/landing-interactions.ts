export function setupLandingInteractions(root: HTMLElement): () => void {
  const belt = root.querySelector<HTMLElement>('#machineBelt');
  const cards = Array.from(root.querySelectorAll<HTMLElement>('.machine-card'));
  const codeCards = Array.from(root.querySelectorAll<HTMLElement>('.machine-code'));
  const canvas = root.querySelector<HTMLCanvasElement>('.machine-fx');
  const context = canvas?.getContext('2d') ?? null;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  let frame = 0;
  let beltWidth = 0, beltHeight = 0, cardWidth = 0, cardHeight = 0, gap = 0;
  let offset = 0, velocity = 0, hover = 0, dragging = false;
  let pointerX = 0, pointerTime = 0, lastFrame = 0, beltVisible = false;
  let beltObserver: IntersectionObserver | undefined;

  const mod = (value: number, length: number) => ((value % length) + length) % length;
  const hash = (a: number, b: number, c: number) => {
    const value = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453;
    return value - Math.floor(value);
  };
  const resizeBelt = () => {
    if (!belt || !canvas) return;
    const rect = belt.getBoundingClientRect();
    beltWidth = rect.width; beltHeight = rect.height;
    cardWidth = cards[0]?.getBoundingClientRect().width || 0;
    cardHeight = cards[0]?.getBoundingClientRect().height || 0;
    gap = parseFloat(getComputedStyle(belt).getPropertyValue('--card-gap')) || 0;
    offset = beltWidth / 2 - cardWidth * .12;
    canvas.width = Math.round(beltWidth * dpr);
    canvas.height = Math.round(beltHeight * dpr);
    canvas.style.width = `${beltWidth}px`;
    canvas.style.height = `${beltHeight}px`;
    context?.setTransform(dpr, 0, 0, dpr, 0, 0);
  };
  const drawFrame = (time: number) => {
    if (!belt || !context || !beltWidth || !cardWidth) return;
    const dt = Math.min(.05, Math.max(0, (time - lastFrame) / 1000));
    lastFrame = time;
    const autoSpeed = reducedMotion ? 0 : -.075 * beltWidth;
    const targetSpeed = dragging ? velocity : autoSpeed * (1 - .65 * hover);
    if (!dragging) velocity += (targetSpeed - velocity) * (1 - Math.exp(-2.2 * dt));
    offset += velocity * dt;

    const span = cardWidth + gap;
    const period = span * cards.length;
    const scannerX = beltWidth / 2;
    const cardTop = 70;
    const positions: number[] = [];
    cards.forEach((card, index) => {
      const x = mod(offset + index * span + span, period) - span;
      positions[index] = x;
      card.style.transform = `translate3d(${x}px,0,0)`;
      const cut = Math.max(0, Math.min(cardWidth, scannerX - x));
      const code = codeCards[index];
      if (cut > 0) {
        card.style.clipPath = `inset(0 0 0 ${cut}px round 0 20px 20px 0)`;
        const mask = `linear-gradient(90deg,transparent ${cut}px,#000 ${cut + 28}px)`;
        card.style.maskImage = mask;
        card.style.webkitMaskImage = mask;
        if (code) {
          code.style.visibility = 'visible';
          code.style.transform = `translate3d(${x}px,0,0)`;
          code.style.clipPath = `inset(0 ${cardWidth - cut}px 0 0)`;
        }
      } else {
        card.style.clipPath = 'none';
        card.style.maskImage = '';
        card.style.webkitMaskImage = '';
        if (code) code.style.visibility = 'hidden';
      }
    });

    context.clearRect(0, 0, beltWidth, beltHeight);
    const colors = ['#FF4A12', '#FF5A1F', '#FF6B2C', '#FF8A3D', '#FFB06A', '#FFD9B5', '#FFF3E6'];
    cards.forEach((_, index) => {
      const x = positions[index];
      const cut = Math.max(0, Math.min(cardWidth, scannerX - x));
      if (!cut || x + cardWidth <= scannerX) return;
      const haze = context.createLinearGradient(scannerX, 0, scannerX + 150, 0);
      haze.addColorStop(0, 'rgba(255,96,40,.32)'); haze.addColorStop(1, 'rgba(255,96,40,0)');
      context.fillStyle = haze;
      context.fillRect(scannerX, cardTop, Math.max(0, Math.min(150, x + cardWidth - scannerX)), cardHeight);
      const reach = Math.min(cardWidth * .3, cardWidth - cut);
      for (let dx = 0; dx < reach; dx += 4) {
        const strength = Math.pow(Math.max(0, 1 - dx / Math.max(1, cardWidth * .3)), 1.7);
        for (let y = -4; y < cardHeight + 4; y += 4) {
          const cell = hash(Math.floor((cut + dx) / 4), Math.floor(y / 4), index);
          if (cell > strength * .78) continue;
          const tone = hash(y, dx, index + 31);
          const colorIndex = dx < 10 ? 4 + Math.floor(tone * 3) : Math.floor(tone * tone * 7);
          if (!reducedMotion && hash(dx, y, Math.floor(time / 110) + 97) < .12) continue;
          context.globalAlpha = Math.min(1, strength * (.72 + tone * .28));
          context.fillStyle = colors[colorIndex];
          context.fillRect(scannerX + dx + (hash(y, dx, 4) - .5) * 1.6, cardTop + y + (hash(dx, y, 9) - .5) * 1.6, 1.3 + tone * 1.6, 1.3 + tone * 1.6);
        }
      }
    });
    context.globalAlpha = 1;
    if (beltVisible) frame = requestAnimationFrame(drawFrame);
  };
  const startBelt = () => {
    if (!beltVisible) return;
    cancelAnimationFrame(frame);
    lastFrame = performance.now();
    frame = requestAnimationFrame(drawFrame);
  };
  const onPointerDown = (event: PointerEvent) => {
    if (!belt) return;
    dragging = true; pointerX = event.clientX; pointerTime = performance.now(); velocity = 0;
    belt.classList.add('is-dragging');
    belt.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent) => {
    hover = 1;
    if (!dragging) return;
    const now = performance.now();
    const dx = event.clientX - pointerX;
    const elapsed = Math.max(8, now - pointerTime);
    offset += dx;
    velocity = dx / elapsed * 1000 * .8 + velocity * .2;
    pointerX = event.clientX; pointerTime = now;
  };
  const onPointerUp = () => { dragging = false; belt?.classList.remove('is-dragging'); };
  const onPointerLeave = () => { if (!dragging) hover = 0; };
  const onWheel = (event: WheelEvent) => {
    if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    event.preventDefault(); velocity += -event.deltaX * 6;
  };

  if (belt && cards.length && canvas && context) {
    resizeBelt();
    belt.addEventListener('pointerdown', onPointerDown);
    belt.addEventListener('pointermove', onPointerMove);
    belt.addEventListener('pointerup', onPointerUp);
    belt.addEventListener('pointercancel', onPointerUp);
    belt.addEventListener('pointerleave', onPointerLeave);
    belt.addEventListener('wheel', onWheel, { passive: false });
    addEventListener('resize', resizeBelt);
    beltObserver = new IntersectionObserver(([entry]) => {
      beltVisible = entry.isIntersecting;
      if (beltVisible) startBelt(); else cancelAnimationFrame(frame);
    }, { rootMargin: '120px' });
    beltObserver.observe(belt);
  }

  const footer = root.querySelector<HTMLElement>('#closingScene');
  const video = root.querySelector<HTMLVideoElement>('#cinemaVideo');
  const power = root.querySelector<HTMLButtonElement>('#scenePower');
  const status = root.querySelector<HTMLElement>('#sceneStatus');
  let sceneState: 'idle' | 'online' | 'closing' | 'offline' = 'idle';
  let didArrive = false, didFly = false;
  let sceneObserver: IntersectionObserver | undefined;
  if (video) {
    video.src = matchMedia('(max-width:760px)').matches
      ? 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/15017aa7-135b-471f-a8a1-42a208bc61b2.mp4'
      : 'https://d2ol7oe51mr4n9.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/abdab52e-bb1b-477d-ae7c-26c5f8915433.mp4';
  }
  const setDotPath = () => {
    if (!footer || !video) return;
    const footerRect = footer.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    const scale = Math.max(videoRect.width / 1920, videoRect.height / 1080);
    const startX = videoRect.left - footerRect.left + (videoRect.width - 1920 * scale) / 2 + 945 * scale;
    const startY = videoRect.top - footerRect.top + (videoRect.height - 1080 * scale) / 2 + 594 * scale;
    const target = footer.querySelector<HTMLElement>('.power-mark')?.getBoundingClientRect();
    if (!target) return;
    footer.style.setProperty('--start-x', `${startX}px`);
    footer.style.setProperty('--start-y', `${startY}px`);
    footer.style.setProperty('--power-x', `${target.left + target.width / 2 - footerRect.left}px`);
    footer.style.setProperty('--power-y', `${target.top + target.height / 2 - footerRect.top}px`);
  };
  const beginOnlineScene = () => {
    if (!footer || didArrive) return;
    didArrive = true; sceneState = 'online'; footer.classList.add('is-arrived');
    if (status) status.textContent = 'Reference market online';
    if (!video || reducedMotion) return;
    const play = () => { video.currentTime = .6; void video.play().catch(() => {}); };
    if (video.readyState >= 1) play(); else video.addEventListener('loadedmetadata', play, { once: true });
  };
  const finishOffline = () => {
    if (!footer || sceneState !== 'closing') return;
    sceneState = 'offline';
    footer.classList.add('is-offline', 'is-lit');
    if (status) status.textContent = 'Reference scene offline';
    if (!didFly) {
      didFly = true;
      setDotPath();
      footer.classList.add('is-flying');
    }
    window.setTimeout(() => footer.classList.remove('is-flying'), 850);
  };
  const onSceneTime = () => {
    if (!video || !footer) return;
    if (sceneState === 'online' && video.currentTime >= 2.3) video.pause();
    if (sceneState === 'closing' && video.currentTime >= 4.62 && !didFly) {
      didFly = true; setDotPath(); footer.classList.add('is-flying');
    }
    if (sceneState === 'closing' && video.currentTime >= 4.98) {
      video.pause(); finishOffline();
    }
  };
  const onSceneEnded = () => finishOffline();
  const onPower = () => {
    if (!footer || sceneState === 'closing') return;
    if (sceneState === 'offline') {
      sceneState = 'online'; didFly = false;
      footer.classList.remove('is-offline', 'is-lit', 'is-flying');
      power?.setAttribute('aria-pressed', 'false');
      if (status) status.textContent = 'Reference market online';
      if (video && !reducedMotion) { video.currentTime = .6; void video.play().catch(() => {}); }
      return;
    }
    power?.setAttribute('aria-pressed', 'true');
    if (reducedMotion || !video) {
      sceneState = 'offline'; footer.classList.add('is-offline', 'is-lit');
      if (status) status.textContent = 'Reference scene offline';
      return;
    }
    sceneState = 'closing'; didFly = false; footer.classList.remove('is-lit');
    if (status) status.textContent = 'Closing reference scene';
    setDotPath(); video.currentTime = 2.3; void video.play().catch(finishOffline);
  };
  if (footer) {
    sceneObserver = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) beginOnlineScene();
      else if (video && sceneState === 'online') video.pause();
    }, { threshold: .35 });
    sceneObserver.observe(footer);
    video?.addEventListener('timeupdate', onSceneTime);
    video?.addEventListener('ended', onSceneEnded);
    video?.addEventListener('error', finishOffline);
    power?.addEventListener('click', onPower);
  }

  return () => {
    beltObserver?.disconnect(); sceneObserver?.disconnect(); cancelAnimationFrame(frame);
    belt?.removeEventListener('pointerdown', onPointerDown);
    belt?.removeEventListener('pointermove', onPointerMove);
    belt?.removeEventListener('pointerup', onPointerUp);
    belt?.removeEventListener('pointercancel', onPointerUp);
    belt?.removeEventListener('pointerleave', onPointerLeave);
    belt?.removeEventListener('wheel', onWheel);
    removeEventListener('resize', resizeBelt);
    video?.pause(); video?.removeEventListener('timeupdate', onSceneTime); video?.removeEventListener('ended', onSceneEnded); video?.removeEventListener('error', finishOffline);
    power?.removeEventListener('click', onPower);
  };
}
