// Real-footage dog: plays packed-alpha video (color on the left half, alpha
// matte on the right half of each frame) and recomposites it with a tiny WebGL
// shader. Packed-alpha H.264 is the one transparent-video format that decodes
// identically in WKWebView (macOS) and WebView2 (Windows).

const VERT = `
attribute vec2 pos;
varying vec2 uv;
void main() {
  uv = vec2(pos.x * 0.5 + 0.5, 0.5 - pos.y * 0.5);
  gl_Position = vec4(pos, 0.0, 1.0);
}`;

const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D tex;
void main() {
  vec3 rgb = texture2D(tex, vec2(uv.x * 0.5, uv.y)).rgb;
  float a = texture2D(tex, vec2(0.5 + uv.x * 0.5, uv.y)).r;
  // the color half is baked over black in the pipeline, so it is already
  // premultiplied, pass it straight through to the premultiplied canvas
  gl_FragColor = vec4(rgb, a);
}`;

export class VideoDog {
  constructor(canvas, clips, convertFileSrc) {
    this.canvas = canvas;
    this.canvas.classList.add('video-dog');
    this.urls = {
      idle: convertFileSrc(clips.idle),
      happy: convertFileSrc(clips.happy),
      sad: convertFileSrc(clips.sad),
    };

    this.video = document.createElement('video');
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.preload = 'auto';

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    this.gl = gl;
    const prog = gl.createProgram();
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VERT],
      [gl.FRAGMENT_SHADER, FRAG],
    ]) {
      const sh = gl.createShader(type);
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      gl.attachShader(prog, sh);
    }
    gl.linkProgram(prog);
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    this.tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, p, gl.CLAMP_TO_EDGE);
    for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, p, gl.LINEAR);

    this._play('idle', true);
    this._raf = requestAnimationFrame(() => this._frame());
  }

  _play(name, loop) {
    this.video.loop = loop;
    this.video.src = this.urls[name];
    // On a one-shot clip the video simply holds its last frame when it ends.
    this.video.play().catch(() => {});
  }

  _frame() {
    const v = this.video;
    const gl = this.gl;
    if (v.readyState >= 2 && v.videoWidth > 0) {
      const w = v.videoWidth / 2;
      const h = v.videoHeight;
      if (this.canvas.width !== w || this.canvas.height !== h) {
        this.canvas.width = w;
        this.canvas.height = h;
        gl.viewport(0, 0, w, h);
        this.canvas.style.aspectRatio = `${w} / ${h}`;
      }
      gl.bindTexture(gl.TEXTURE_2D, this.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, v);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    this._raf = requestAnimationFrame(() => this._frame());
  }

  setMode(mode) {
    if (mode === 'enter') {
      requestAnimationFrame(() => this.canvas.classList.add('dog-in'));
    } else if (mode === 'happy') {
      this._play('happy', false);
    } else if (mode === 'sad') {
      this._play('sad', false);
    } else if (mode === 'leave') {
      this.canvas.classList.add('dog-out');
    }
    // 'idle' and 'ask' keep the idle loop running
  }

  // DOM hearts (the 3D dog uses sprites; here plain emoji float up)
  spawnHearts() {
    for (let i = 0; i < 9; i++) {
      const h = document.createElement('div');
      h.className = 'heart';
      h.textContent = '💛';
      h.style.left = `${44 + (i % 5) * 3}%`;
      h.style.animationDelay = `${(i % 4) * 0.22}s`;
      h.style.fontSize = `${22 + (i % 3) * 8}px`;
      document.body.appendChild(h);
      setTimeout(() => h.remove(), 2600 + (i % 4) * 220);
    }
  }
}
