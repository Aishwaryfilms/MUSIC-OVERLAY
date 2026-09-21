class FluidWaveVisualizer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.options = {
      lineColor: options.lineColor || 'rgba(255, 255, 255, 0.75)',
      secondaryColor: options.secondaryColor || 'rgba(255, 255, 255, 0.25)',
      linesCount: options.linesCount || 3,
      speed: options.speed || 0.04,
      maxAmplitude: options.maxAmplitude || 18,
      isPlaying: options.isPlaying !== undefined ? options.isPlaying : true,
      ...options
    };

    this.step = 0;
    this.currentAmp = this.options.isPlaying ? this.options.maxAmplitude : 0;
    this.targetAmp = this.options.isPlaying ? this.options.maxAmplitude : 0;
    this.animationId = null;

    this.resize();
    this.animate = this.animate.bind(this);
    this.animate();
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width || 200;
    this.height = rect.height || 40;
    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.scale(dpr, dpr);
  }

  setPlaying(isPlaying) {
    this.options.isPlaying = isPlaying;
    this.targetAmp = isPlaying ? this.options.maxAmplitude : 0;
  }

  setColor(color, secondary) {
    this.options.lineColor = color || this.options.lineColor;
    this.options.secondaryColor = secondary || this.options.secondaryColor;
  }

  animate() {
    this.currentAmp += (this.targetAmp - this.currentAmp) * 0.08;
    this.ctx.clearRect(0, 0, this.width, this.height);

    const centerY = this.height / 2;
    const waveLength = this.width;

    // Draw multi-layered clean sinusoidal waves
    for (let l = 0; l < this.options.linesCount; l++) {
      this.ctx.beginPath();
      const phaseOffset = (l * Math.PI) / 3;
      const speedMultiplier = 1 + l * 0.3;
      const amp = this.currentAmp * (1 - l * 0.22);

      this.ctx.lineWidth = l === 0 ? 2 : 1.2;
      this.ctx.strokeStyle = l === 0 ? this.options.lineColor : this.options.secondaryColor;
      this.ctx.lineCap = 'round';

      for (let x = 0; x <= this.width; x += 3) {
        // Natural windowing envelope so the wave tapers gracefully at the edges
        const envelope = Math.sin((x / this.width) * Math.PI);
        const y = centerY + Math.sin((x / 24) + (this.step * speedMultiplier) + phaseOffset) * amp * envelope;

        if (x === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
      this.ctx.stroke();
    }

    if (this.options.isPlaying || this.currentAmp > 0.05) {
      this.step += this.options.speed;
    }

    this.animationId = requestAnimationFrame(this.animate);
  }

  destroy() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
    }
  }
}

window.FluidWaveVisualizer = FluidWaveVisualizer;
