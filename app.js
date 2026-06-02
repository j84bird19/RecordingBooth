(() => {
  'use strict';

  const VERSION = 'fresh-v1-1-vocal-fx-routing';
  const DB_NAME = 'recording-booth-fresh-v1-1';
  const DB_STORE = 'project';
  const SAMPLE_RATE = 44100;

  const $ = (id) => document.getElementById(id);
  const els = {
    status: $('statusPill'),
    tracks: $('tracks'),
    timeline: $('timeline'),
    time: $('timeReadout'),
    songName: $('songNameInput'),
    enable: $('enableAudioBtn'),
    recordMode: $('recordModeBtn'),
    rewind: $('rewindBtn'),
    play: $('playBtn'),
    stop: $('stopBtn'),
    save: $('saveProjectBtn'),
    load: $('loadProjectBtn'),
    exportDry: $('exportDryBtn'),
    exportMix: $('exportMixBtn'),
    musicFile1: $('musicFile1'),
    musicFile2: $('musicFile2')
  };

  const tracks = [
    makeTrack('music1', 'music', 'Music 1'),
    makeTrack('music2', 'music', 'Music 2'),
    makeTrack('vocal1', 'vocal', 'Vocal 1'),
    makeTrack('vocal2', 'vocal', 'Vocal 2'),
    makeTrack('vocal3', 'vocal', 'Vocal 3'),
    makeTrack('vocal4', 'vocal', 'Vocal 4'),
    makeTrack('vocal5', 'vocal', 'Vocal 5')
  ];

  const ui = { laneCanvas: new Map(), overviewCanvas: new Map(), meterFill: new Map(), subtitles: new Map(), buttons: new Map(), emptyLabels: new Map() };

  const engine = {
    audioCtx: null,
    masterGain: null,
    micStream: null,
    micSource: null,
    micAnalyser: null,
    micData: null,
    isPlaying: false,
    recordMode: false,
    playhead: 0,
    playStartAudioTime: 0,
    playStartSongTime: 0,
    sources: new Map(),
    wakeLock: null,
    mediaRecorder: null,
    recordChunks: [],
    recordingTrackId: null,
    recordingStartSongTime: 0,
    raf: 0,
    meterTimer: 0
  };

  function makeTrack(id, type, name) {
    return {
      id, type, name,
      fileName: '',
      audioBuffer: null,
      blob: null,
      startTime: 0,
      volume: 1,
      pan: 0,
      gain: 1,
      muted: false,
      solo: false,
      armed: false,
      fx: {
        eq: false,
        comp: false,
        reverb: 0,
        delay: 0
      },
      nodes: null
    };
  }

  function setStatus(text) { els.status.textContent = text; }
  function formatTime(seconds) {
    seconds = Math.max(0, seconds || 0);
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    const cs = Math.floor((seconds % 1) * 100).toString().padStart(2, '0');
    return `${m}:${s}.${cs}`;
  }
  function songLength() {
    const max = tracks.reduce((m, t) => t.audioBuffer ? Math.max(m, t.startTime + t.audioBuffer.duration) : m, 0);
    return Math.max(max, 30);
  }
  function trackById(id) { return tracks.find(t => t.id === id); }

  async function ensureAudio() {
    if (!engine.audioCtx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error('Web Audio API is not supported in this browser.');
      engine.audioCtx = new AC();
      engine.masterGain = engine.audioCtx.createGain();
      engine.masterGain.gain.value = 0.95;
      engine.masterGain.connect(engine.audioCtx.destination);
    }
    if (engine.audioCtx.state !== 'running') await engine.audioCtx.resume();
  }

  async function enableMic() {
    await ensureAudio();
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is not available in this browser. Use HTTPS/Chrome on Android.');
    if (!engine.micStream) {
      engine.micStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      engine.micSource = engine.audioCtx.createMediaStreamSource(engine.micStream);
      engine.micAnalyser = engine.audioCtx.createAnalyser();
      engine.micAnalyser.fftSize = 1024;
      engine.micAnalyser.smoothingTimeConstant = 0.55;
      engine.micData = new Uint8Array(engine.micAnalyser.fftSize);
      engine.micSource.connect(engine.micAnalyser);
      startMeterLoop();
    }
    setStatus('Mic ready');
  }

  function render() {
    renderTimeline();
    renderTracks();
    requestAnimationFrame(redrawAllWaveforms);
  }

  function renderTimeline() {
    els.timeline.innerHTML = '<div class="timeline-grid"></div><div class="playhead" id="playhead"></div>';
    tracks.forEach(t => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      row.innerHTML = `<div class="timeline-label">${t.name}</div><div class="timeline-lane"><canvas class="overview-canvas" data-track="${t.id}"></canvas></div>`;
      els.timeline.appendChild(row);
      ui.overviewCanvas.set(t.id, row.querySelector('canvas'));
    });
    els.timeline.addEventListener('click', onTimelineClick, { passive: true });
  }

  function renderTracks() {
    els.tracks.innerHTML = '';
    tracks.forEach(t => {
      const card = document.createElement('div');
      card.className = `track ${t.type}`;
      card.dataset.track = t.id;
      card.innerHTML = `
        <div class="track-head">
          <div class="track-title">${t.name}</div>
          <div class="track-sub" data-subtitle>${t.fileName || (t.type === 'music' ? 'No music loaded' : 'Empty vocal track')}</div>
          <div class="control-row">
            ${t.type === 'music' ? `<button class="btn tiny load-btn" data-action="load">Load</button>` : ''}
            <button class="btn tiny toggle mute" data-action="mute">M</button>
            <button class="btn tiny toggle solo" data-action="solo">S</button>
            ${t.type === 'vocal' ? `<button class="btn tiny toggle arm" data-action="arm">R</button>` : ''}
          </div>
          <label class="slider-row"><span>Vol</span><input type="range" min="0" max="1.5" step="0.01" value="${t.volume}" data-action="volume"></label>
          <label class="slider-row"><span>Pan</span><input type="range" min="-1" max="1" step="0.01" value="${t.pan}" data-action="pan"></label>
          <label class="slider-row"><span>Gain</span><input type="range" min="0" max="2" step="0.01" value="${t.gain}" data-action="gain"></label>
        </div>
        <div class="track-lane">
          <div class="lane-canvas-wrap">
            <canvas class="wave-canvas" data-track="${t.id}"></canvas>
            <div class="empty-lane" data-empty>${t.type === 'music' ? 'Load audio to show WAV' : 'Record audio to show WAV'}</div>
          </div>
          ${t.type === 'vocal' ? `<div class="meter-row"><span>INPUT</span><div class="meter"><div class="meter-fill" data-meter></div></div></div>` : ''}
          ${t.type === 'vocal' ? `
          <div class="fx-row vocal-fx">
            <label class="fx-toggle">EQ <input type="checkbox" data-action="fxToggle" data-fx="eq" ${t.fx.eq ? 'checked' : ''}></label>
            <label class="fx-toggle">Comp <input type="checkbox" data-action="fxToggle" data-fx="comp" ${t.fx.comp ? 'checked' : ''}></label>
            <label class="fx-slider"><span>Rev</span><input type="range" min="0" max="1" step="0.01" value="${t.fx.reverb}" data-action="fxRange" data-fx="reverb"></label>
            <label class="fx-slider"><span>Delay</span><input type="range" min="0" max="1" step="0.01" value="${t.fx.delay}" data-action="fxRange" data-fx="delay"></label>
          </div>` : `<div class="fx-row muted-note">Music track — no vocal FX</div>`}
        </div>
      `;
      els.tracks.appendChild(card);
      ui.laneCanvas.set(t.id, card.querySelector('.wave-canvas'));
      ui.subtitles.set(t.id, card.querySelector('[data-subtitle]'));
      ui.emptyLabels.set(t.id, card.querySelector('[data-empty]'));
      if (t.type === 'vocal') ui.meterFill.set(t.id, card.querySelector('[data-meter]'));
      ui.buttons.set(`${t.id}:mute`, card.querySelector('[data-action="mute"]'));
      ui.buttons.set(`${t.id}:solo`, card.querySelector('[data-action="solo"]'));
      if (t.type === 'vocal') ui.buttons.set(`${t.id}:arm`, card.querySelector('[data-action="arm"]'));

      card.addEventListener('click', (e) => handleTrackClick(e, t));
      card.addEventListener('input', (e) => handleTrackInput(e, t));
    });
    refreshControls();
  }

  function handleTrackClick(e, t) {
    const action = e.target?.dataset?.action;
    if (!action) return;
    if (action === 'load') {
      (t.id === 'music1' ? els.musicFile1 : els.musicFile2).click();
      return;
    }
    if (action === 'mute') t.muted = !t.muted;
    if (action === 'solo') t.solo = !t.solo;
    if (action === 'arm') {
      if (!t.audioBuffer) {
        tracks.filter(x => x.type === 'vocal').forEach(x => { if (x.id !== t.id) x.armed = false; });
        t.armed = !t.armed;
        if (t.armed) enableMic().catch(showError);
      } else {
        t.armed = !t.armed;
        if (t.armed) enableMic().catch(showError);
      }
    }
    if (action === 'fxToggle' && t.type === 'vocal') {
      const fx = e.target?.dataset?.fx;
      if (fx && fx in t.fx) t.fx[fx] = !!e.target.checked;
      updateFxNodes(t);
      setStatus(`${t.name} FX updated`);
    }
    refreshControls();
    resolveMixer();
    redrawAllWaveforms();
  }

  function handleTrackInput(e, t) {
    const action = e.target?.dataset?.action;
    if (!action) return;
    const value = Number(e.target.value);
    if (action === 'volume') t.volume = value;
    if (action === 'pan') t.pan = value;
    if (action === 'gain') t.gain = value;
    if (action === 'fxRange' && t.type === 'vocal') {
      const fx = e.target?.dataset?.fx;
      if (fx && fx in t.fx) t.fx[fx] = value;
      updateFxNodes(t);
    }
    resolveMixer();
    redrawTrack(t.id);
  }

  function refreshControls() {
    tracks.forEach(t => {
      ui.buttons.get(`${t.id}:mute`)?.classList.toggle('active', t.muted);
      ui.buttons.get(`${t.id}:solo`)?.classList.toggle('active', t.solo);
      ui.buttons.get(`${t.id}:arm`)?.classList.toggle('active', t.armed);
      const sub = ui.subtitles.get(t.id);
      if (sub) sub.textContent = t.fileName || (t.type === 'music' ? 'No music loaded' : 'Empty vocal track');
      const empty = ui.emptyLabels.get(t.id);
      if (empty) empty.style.display = t.audioBuffer ? 'none' : 'flex';
    });
    els.recordMode.classList.toggle('active', engine.recordMode);
    els.recordMode.textContent = engine.recordMode ? '● Record On' : '● Record Off';
  }

  function audibleTracks() {
    const anySolo = tracks.some(t => t.solo);
    return tracks.filter(t => t.audioBuffer && !t.muted && (!anySolo || t.solo));
  }

  function resolveMixer() {
    const anySolo = tracks.some(t => t.solo);
    tracks.forEach(t => {
      if (!t.nodes) return;
      const shouldHear = t.audioBuffer && !t.muted && (!anySolo || t.solo);
      t.nodes.outputGain.gain.setTargetAtTime(shouldHear ? t.volume : 0, engine.audioCtx.currentTime, 0.01);
      t.nodes.inputGain.gain.setTargetAtTime(t.gain, engine.audioCtx.currentTime, 0.01);
      if (t.nodes.pan) t.nodes.pan.pan.setTargetAtTime(t.pan, engine.audioCtx.currentTime, 0.01);
      updateFxNodes(t);
    });
  }

  async function loadMusic(trackId, file) {
    if (!file) return;
    await ensureAudio();
    try {
      const array = await file.arrayBuffer();
      const buffer = await engine.audioCtx.decodeAudioData(array.slice(0));
      const t = trackById(trackId);
      t.audioBuffer = buffer;
      t.blob = file;
      t.fileName = file.name;
      t.startTime = 0;
      updateTrackAfterAudioChange(t);
      setStatus(`${t.name} loaded`);
    } catch (err) { showError(err); }
  }

  function updateTrackAfterAudioChange(t) {
    refreshControls();
    redrawTrack(t.id);
    redrawOverview(t.id);
    updatePlayhead();
  }

  async function play() {
    await ensureAudio();
    if (engine.isPlaying) return;
    engine.isPlaying = true;
    engine.playStartAudioTime = engine.audioCtx.currentTime;
    engine.playStartSongTime = engine.playhead;
    scheduleSources();
    if (engine.recordMode) startRecordingIfPossible();
    requestWakeLock();
    startAnimationLoop();
    setStatus(engine.recordMode ? 'Recording' : 'Playing');
  }

  function scheduleSources() {
    stopSourcesOnly();
    audibleTracks().forEach(t => {
      const rel = engine.playhead - t.startTime;
      if (rel >= t.audioBuffer.duration) return;
      const source = engine.audioCtx.createBufferSource();
      source.buffer = t.audioBuffer;
      const nodes = buildTrackGraph(engine.audioCtx, source, t, engine.masterGain);
      const offset = Math.max(0, rel);
      const delay = rel < 0 ? -rel : 0;
      source.start(engine.audioCtx.currentTime + delay, offset);
      t.nodes = { source, ...nodes };
      updateFxNodes(t);
      engine.sources.set(t.id, source);
      source.onended = () => { if (engine.sources.get(t.id) === source) engine.sources.delete(t.id); };
    });
    resolveMixer();
  }

  function stopSourcesOnly() {
    engine.sources.forEach(src => { try { src.stop(); } catch (_) {} });
    engine.sources.clear();
    tracks.forEach(t => { t.nodes = null; });
  }


  function buildTrackGraph(ctx, source, track, destination) {
    const inputGain = ctx.createGain();
    const outputGain = ctx.createGain();
    const pan = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
    inputGain.gain.value = track.gain;
    outputGain.gain.value = track.volume;

    source.connect(inputGain);
    let processed = inputGain;
    const nodes = { inputGain, outputGain, pan };

    if (track.type === 'vocal') {
      const highpass = ctx.createBiquadFilter();
      highpass.type = 'highpass';
      const presence = ctx.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = 3400;
      presence.Q.value = 0.9;
      const air = ctx.createBiquadFilter();
      air.type = 'highshelf';
      air.frequency.value = 8500;

      const compressor = ctx.createDynamicsCompressor();
      processed.connect(highpass);
      highpass.connect(presence);
      presence.connect(air);
      air.connect(compressor);
      processed = compressor;

      const dryGain = ctx.createGain();
      const reverbGain = ctx.createGain();
      const delayNode = ctx.createDelay(1.5);
      const delayWetGain = ctx.createGain();
      const feedbackGain = ctx.createGain();
      const convolver = ctx.createConvolver();
      convolver.buffer = getImpulseResponse(ctx);

      processed.connect(dryGain);
      processed.connect(convolver);
      convolver.connect(reverbGain);
      processed.connect(delayNode);
      delayNode.connect(delayWetGain);
      delayNode.connect(feedbackGain);
      feedbackGain.connect(delayNode);

      const fxOut = ctx.createGain();
      dryGain.connect(fxOut);
      reverbGain.connect(fxOut);
      delayWetGain.connect(fxOut);
      processed = fxOut;

      Object.assign(nodes, { highpass, presence, air, compressor, dryGain, reverbGain, delayNode, delayWetGain, feedbackGain, convolver });
    }

    if (pan) {
      processed.connect(pan);
      pan.connect(outputGain);
    } else {
      processed.connect(outputGain);
    }
    outputGain.connect(destination);
    return nodes;
  }

  const impulseCache = new WeakMap();
  function getImpulseResponse(ctx) {
    if (impulseCache.has(ctx)) return impulseCache.get(ctx);
    const seconds = 1.25;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buffer.getChannelData(ch);
      for (let i = 0; i < length; i++) {
        const decay = Math.pow(1 - i / length, 2.4);
        data[i] = (Math.random() * 2 - 1) * decay * 0.55;
      }
    }
    impulseCache.set(ctx, buffer);
    return buffer;
  }

  function updateFxNodes(track) {
    if (!track?.nodes || track.type !== 'vocal') return;
    const ctx = engine.audioCtx;
    const now = ctx?.currentTime || 0;
    const fx = track.fx || { eq: false, comp: false, reverb: 0, delay: 0 };
    const eqOn = !!fx.eq;
    const compOn = !!fx.comp;
    if (track.nodes.highpass) track.nodes.highpass.frequency.setTargetAtTime(eqOn ? 85 : 20, now, 0.015);
    if (track.nodes.presence) track.nodes.presence.gain.setTargetAtTime(eqOn ? 4.5 : 0, now, 0.015);
    if (track.nodes.air) track.nodes.air.gain.setTargetAtTime(eqOn ? 3.2 : 0, now, 0.015);
    if (track.nodes.compressor) {
      track.nodes.compressor.threshold.setTargetAtTime(compOn ? -24 : 0, now, 0.015);
      track.nodes.compressor.knee.setTargetAtTime(compOn ? 16 : 0, now, 0.015);
      track.nodes.compressor.ratio.setTargetAtTime(compOn ? 4 : 1, now, 0.015);
      track.nodes.compressor.attack.setTargetAtTime(compOn ? 0.006 : 0.003, now, 0.015);
      track.nodes.compressor.release.setTargetAtTime(compOn ? 0.18 : 0.25, now, 0.015);
    }
    if (track.nodes.reverbGain) track.nodes.reverbGain.gain.setTargetAtTime(Math.pow(Number(fx.reverb) || 0, 1.15) * 0.75, now, 0.015);
    if (track.nodes.delayNode) track.nodes.delayNode.delayTime.setTargetAtTime(0.18 + (Number(fx.delay) || 0) * 0.42, now, 0.015);
    if (track.nodes.delayWetGain) track.nodes.delayWetGain.gain.setTargetAtTime(Math.pow(Number(fx.delay) || 0, 1.1) * 0.55, now, 0.015);
    if (track.nodes.feedbackGain) track.nodes.feedbackGain.gain.setTargetAtTime((Number(fx.delay) || 0) * 0.38, now, 0.015);
  }

  function stop() {
    if (engine.isPlaying) {
      engine.playhead = currentSongTime();
    }
    engine.isPlaying = false;
    stopSourcesOnly();
    stopRecordingIfActive();
    releaseWakeLock();
    cancelAnimationFrame(engine.raf);
    updatePlayhead();
    setStatus('Stopped');
  }

  function rewind() {
    stop();
    engine.playhead = 0;
    updatePlayhead();
    setStatus('Rewound');
  }

  function currentSongTime() {
    if (!engine.isPlaying || !engine.audioCtx) return engine.playhead;
    return engine.playStartSongTime + (engine.audioCtx.currentTime - engine.playStartAudioTime);
  }

  function startAnimationLoop() {
    cancelAnimationFrame(engine.raf);
    const tick = () => {
      if (engine.isPlaying) updatePlayhead(currentSongTime());
      engine.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function updatePlayhead(time = engine.playhead) {
    const t = Math.max(0, Math.min(time, songLength()));
    els.time.textContent = formatTime(t);
    const ph = document.getElementById('playhead');
    if (ph) {
      const timelineWidth = Math.max(1, els.timeline.clientWidth - (window.innerWidth <= 720 ? 72 : 90));
      const labelW = window.innerWidth <= 720 ? 72 : 90;
      const pct = t / songLength();
      ph.style.left = `${labelW + pct * timelineWidth}px`;
    }
  }

  function onTimelineClick(e) {
    const rect = els.timeline.getBoundingClientRect();
    const labelW = window.innerWidth <= 720 ? 72 : 90;
    const x = Math.max(0, e.clientX - rect.left - labelW);
    const width = Math.max(1, rect.width - labelW);
    engine.playhead = (x / width) * songLength();
    if (engine.isPlaying) {
      stopSourcesOnly();
      engine.playStartAudioTime = engine.audioCtx.currentTime;
      engine.playStartSongTime = engine.playhead;
      scheduleSources();
    }
    updatePlayhead();
  }

  async function startRecordingIfPossible() {
    try {
      await enableMic();
      if (engine.mediaRecorder?.state === 'recording') return;
      const target = tracks.find(t => t.type === 'vocal' && t.armed && !t.audioBuffer) || tracks.find(t => t.type === 'vocal' && !t.audioBuffer) || tracks.find(t => t.type === 'vocal' && t.armed);
      if (!target) { setStatus('No vocal track available'); return; }
      tracks.filter(t => t.type === 'vocal').forEach(t => t.armed = t.id === target.id);
      refreshControls();
      engine.recordingTrackId = target.id;
      engine.recordingStartSongTime = engine.playhead;
      engine.recordChunks = [];
      const mime = pickRecorderMime();
      engine.mediaRecorder = mime ? new MediaRecorder(engine.micStream, { mimeType: mime }) : new MediaRecorder(engine.micStream);
      engine.mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) engine.recordChunks.push(e.data); };
      engine.mediaRecorder.onstop = finishRecording;
      engine.mediaRecorder.start(120);
      setStatus(`Recording ${target.name}`);
    } catch (err) { showError(err); }
  }

  function pickRecorderMime() {
    const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    return types.find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
  }

  function stopRecordingIfActive() {
    const rec = engine.mediaRecorder;
    if (rec && rec.state !== 'inactive') {
      try { rec.stop(); } catch (err) { console.warn(err); }
    }
  }

  async function finishRecording() {
    const target = trackById(engine.recordingTrackId);
    const chunks = engine.recordChunks.slice();
    engine.recordChunks = [];
    if (!target || chunks.length === 0) return;
    try {
      const blob = new Blob(chunks, { type: chunks[0]?.type || engine.mediaRecorder?.mimeType || 'audio/webm' });
      const arr = await blob.arrayBuffer();
      const buffer = await engine.audioCtx.decodeAudioData(arr.slice(0));
      target.audioBuffer = buffer;
      target.blob = encodeWavBlob(buffer);
      target.fileName = `${target.name} take.wav`;
      target.startTime = engine.recordingStartSongTime;
      target.armed = false;
      updateTrackAfterAudioChange(target);
      setStatus(`${target.name} saved`);
    } catch (err) {
      setStatus('Recording saved, but browser could not decode it for waveform/export');
      console.error(err);
    } finally {
      engine.recordingTrackId = null;
      refreshControls();
    }
  }

  function startMeterLoop() {
    cancelAnimationFrame(engine.meterTimer);
    const tick = () => {
      updateMeters();
      engine.meterTimer = requestAnimationFrame(tick);
    };
    tick();
  }

  function updateMeters() {
    let level = 0;
    if (engine.micAnalyser && engine.micData) {
      engine.micAnalyser.getByteTimeDomainData(engine.micData);
      let sum = 0;
      for (let i = 0; i < engine.micData.length; i++) {
        const v = (engine.micData[i] - 128) / 128;
        sum += v * v;
      }
      level = Math.sqrt(sum / engine.micData.length);
      level = Math.min(1, level * 5.5);
    }
    tracks.filter(t => t.type === 'vocal').forEach(t => {
      const fill = ui.meterFill.get(t.id);
      if (!fill) return;
      const active = t.armed || engine.recordingTrackId === t.id;
      fill.style.width = `${active ? Math.max(level * 100, engine.micStream ? 3 : 0) : 0}%`;
    });
  }

  function redrawAllWaveforms() {
    sizeCanvases();
    tracks.forEach(t => { redrawTrack(t.id); redrawOverview(t.id); });
    updatePlayhead(currentSongTime());
  }

  function redrawTrack(id) {
    const t = trackById(id);
    const c = ui.laneCanvas.get(id);
    if (!t || !c) return;
    drawWaveform(c, t, false);
  }

  function redrawOverview(id) {
    const t = trackById(id);
    const c = ui.overviewCanvas.get(id);
    if (!t || !c) return;
    drawWaveform(c, t, true);
  }

  function sizeCanvases() {
    [...ui.laneCanvas.values(), ...ui.overviewCanvas.values()].forEach(c => {
      const rect = c.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(rect.width * dpr));
      const h = Math.max(1, Math.floor(rect.height * dpr));
      if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
    });
  }

  function drawWaveform(canvas, track, overview) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = overview ? '#11141a' : '#0e1015';
    ctx.fillRect(0, 0, w, h);
    drawGrid(ctx, w, h, overview);
    if (!track.audioBuffer) return;
    const data = track.audioBuffer.getChannelData(0);
    const dur = overview ? songLength() : Math.max(track.audioBuffer.duration, 1);
    const startPx = overview ? (track.startTime / dur) * w : 0;
    const clipW = overview ? (track.audioBuffer.duration / dur) * w : w;
    const color = track.type === 'music' ? '#d7a83d' : '#4aa3ff';
    const mid = h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(startPx, 0, Math.max(1, clipW), h);
    ctx.clip();
    ctx.fillStyle = track.type === 'music' ? 'rgba(215,168,61,.10)' : 'rgba(74,163,255,.10)';
    ctx.fillRect(startPx, 2, Math.max(1, clipW), h - 4);
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = Math.max(1, window.devicePixelRatio || 1);
    const bars = Math.max(80, Math.floor(clipW / 3));
    const step = Math.max(1, Math.floor(data.length / bars));
    for (let i = 0; i < bars; i++) {
      let min = 1, max = -1;
      const start = i * step;
      const end = Math.min(data.length, start + step);
      for (let j = start; j < end; j++) {
        const v = data[j]; if (v < min) min = v; if (v > max) max = v;
      }
      const amp = Math.max(Math.abs(min), Math.abs(max), 0.015);
      const x = startPx + (i / bars) * clipW;
      const barH = amp * h * 0.82;
      ctx.globalAlpha = track.muted ? 0.35 : 0.95;
      ctx.fillRect(x, mid - barH / 2, Math.max(1, clipW / bars * 0.75), Math.max(1, barH));
    }
    ctx.restore();
  }

  function drawGrid(ctx, w, h, overview) {
    ctx.strokeStyle = overview ? 'rgba(255,255,255,.08)' : 'rgba(255,255,255,.05)';
    ctx.lineWidth = 1;
    const step = overview ? Math.max(40, w / 8) : Math.max(48, w / 10);
    for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
    ctx.strokeStyle = 'rgba(255,255,255,.09)';
    ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke();
  }

  function encodeWavBlob(buffer) { return new Blob([encodeWav(buffer)], { type: 'audio/wav' }); }
  function encodeWav(buffer) {
    const channels = Math.min(2, buffer.numberOfChannels);
    const length = buffer.length * channels * 2 + 44;
    const out = new ArrayBuffer(length);
    const view = new DataView(out);
    writeString(view, 0, 'RIFF'); view.setUint32(4, length - 8, true); writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, channels, true);
    view.setUint32(24, buffer.sampleRate, true); view.setUint32(28, buffer.sampleRate * channels * 2, true); view.setUint16(32, channels * 2, true); view.setUint16(34, 16, true);
    writeString(view, 36, 'data'); view.setUint32(40, length - 44, true);
    let offset = 44;
    const chData = Array.from({ length: channels }, (_, i) => buffer.getChannelData(i));
    for (let i = 0; i < buffer.length; i++) {
      for (let ch = 0; ch < channels; ch++) {
        const s = Math.max(-1, Math.min(1, chData[ch][i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true); offset += 2;
      }
    }
    return out;
  }
  function writeString(view, offset, str) { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); }

  function makeAlignedStem(track) {
    const len = Math.ceil(songLength() * SAMPLE_RATE);
    const channels = 2;
    const fake = {
      numberOfChannels: channels,
      length: len,
      sampleRate: SAMPLE_RATE,
      getChannelData: (ch) => arrays[ch]
    };
    const arrays = [new Float32Array(len), new Float32Array(len)];
    if (!track.audioBuffer) return fake;
    const offset = Math.floor(track.startTime * SAMPLE_RATE);
    for (let ch = 0; ch < channels; ch++) {
      const src = track.audioBuffer.getChannelData(Math.min(ch, track.audioBuffer.numberOfChannels - 1));
      for (let i = 0; i < src.length && offset + i < len; i++) arrays[ch][offset + i] += src[i] * track.gain;
    }
    return fake;
  }

  function exportDryStems() {
    const name = safeName(els.songName.value || 'MicCheckSong');
    tracks.filter(t => t.audioBuffer).forEach(t => downloadBlob(encodeWavBlob(makeAlignedStem(t)), `${name}_${t.name.replace(/\s+/g, '')}_dry.wav`));
    setStatus('Dry stems exported');
  }

  async function exportRoughMix() {
    const name = safeName(els.songName.value || 'MicCheckSong');
    if (window.OfflineAudioContext) {
      const len = Math.ceil(songLength() * SAMPLE_RATE);
      const offline = new OfflineAudioContext(2, len, SAMPLE_RATE);
      const master = offline.createGain();
      master.gain.value = 0.95;
      master.connect(offline.destination);
      audibleTracks().forEach(t => {
        const source = offline.createBufferSource();
        source.buffer = t.audioBuffer;
        buildTrackGraph(offline, source, t, master);
        const start = Math.max(0, t.startTime || 0);
        source.start(start);
      });
      const rendered = await offline.startRendering();
      downloadBlob(encodeWavBlob(rendered), `${name}_rough_mix.wav`);
      setStatus('Wet rough mix exported');
      return;
    }

    const len = Math.ceil(songLength() * SAMPLE_RATE);
    const arrays = [new Float32Array(len), new Float32Array(len)];
    audibleTracks().forEach(t => {
      const offset = Math.floor(t.startTime * SAMPLE_RATE);
      const leftGain = Math.cos((t.pan + 1) * Math.PI / 4) * t.volume * t.gain;
      const rightGain = Math.sin((t.pan + 1) * Math.PI / 4) * t.volume * t.gain;
      const srcL = t.audioBuffer.getChannelData(0);
      const srcR = t.audioBuffer.getChannelData(Math.min(1, t.audioBuffer.numberOfChannels - 1));
      for (let i = 0; i < srcL.length && offset + i < len; i++) {
        arrays[0][offset + i] += srcL[i] * leftGain;
        arrays[1][offset + i] += srcR[i] * rightGain;
      }
    });
    peakLimit(arrays);
    const fake = { numberOfChannels: 2, length: len, sampleRate: SAMPLE_RATE, getChannelData: ch => arrays[ch] };
    downloadBlob(encodeWavBlob(fake), `${name}_rough_mix.wav`);
    setStatus('Rough mix exported');
  }

  function peakLimit(arrays) {
    let peak = 0; arrays.forEach(a => a.forEach(v => { peak = Math.max(peak, Math.abs(v)); }));
    const gain = peak > 0.98 ? 0.98 / peak : 1;
    arrays.forEach(a => { for (let i = 0; i < a.length; i++) a[i] *= gain; });
  }
  function downloadBlob(blob, fileName) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = fileName; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 30000); }
  function safeName(s) { return String(s).replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'MicCheckSong'; }

  async function saveProject() {
    try {
      const db = await openDb();
      const data = {
        version: VERSION,
        songName: els.songName.value,
        playhead: engine.playhead,
        tracks: tracks.map(t => ({
          id: t.id, fileName: t.fileName, startTime: t.startTime, volume: t.volume, pan: t.pan, gain: t.gain,
          muted: t.muted, solo: t.solo, armed: false, type: t.type, fx: t.fx, blob: t.blob || null
        }))
      };
      await txPut(db, 'active', data);
      setStatus('Project saved');
    } catch (err) { showError(err); }
  }

  async function loadProject() {
    try {
      await ensureAudio();
      const db = await openDb();
      const data = await txGet(db, 'active');
      if (!data) { setStatus('No saved project'); return; }
      els.songName.value = data.songName || 'MicCheckSong';
      engine.playhead = data.playhead || 0;
      for (const saved of data.tracks || []) {
        const t = trackById(saved.id); if (!t) continue;
        Object.assign(t, { fileName: saved.fileName || '', startTime: saved.startTime || 0, volume: saved.volume ?? 1, pan: saved.pan ?? 0, gain: saved.gain ?? 1, muted: !!saved.muted, solo: !!saved.solo, armed: false, fx: Object.assign({ eq: false, comp: false, reverb: 0, delay: 0 }, saved.fx || {}), blob: saved.blob || null, audioBuffer: null });
        if (saved.blob) {
          try { t.audioBuffer = await engine.audioCtx.decodeAudioData(await saved.blob.arrayBuffer()); } catch (e) { console.warn('Could not decode saved track', t.id, e); }
        }
      }
      render(); updatePlayhead(); setStatus('Project loaded');
    } catch (err) { showError(err); }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  function txPut(db, key, value) { return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readwrite'); tx.objectStore(DB_STORE).put(value, key); tx.oncomplete = resolve; tx.onerror = () => reject(tx.error); }); }
  function txGet(db, key) { return new Promise((resolve, reject) => { const tx = db.transaction(DB_STORE, 'readonly'); const req = tx.objectStore(DB_STORE).get(key); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); }

  async function requestWakeLock() { try { if ('wakeLock' in navigator) engine.wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {} }
  function releaseWakeLock() { try { engine.wakeLock?.release(); } catch (_) {} engine.wakeLock = null; }
  function showError(err) { console.error(err); setStatus(err?.message || 'Error'); alert(err?.message || String(err)); }

  els.enable.addEventListener('click', () => enableMic().catch(showError));
  els.recordMode.addEventListener('click', async () => { engine.recordMode = !engine.recordMode; refreshControls(); if (engine.recordMode) await enableMic().catch(showError); });
  els.play.addEventListener('click', () => play().catch(showError));
  els.stop.addEventListener('click', stop);
  els.rewind.addEventListener('click', rewind);
  els.musicFile1.addEventListener('change', e => loadMusic('music1', e.target.files[0]));
  els.musicFile2.addEventListener('change', e => loadMusic('music2', e.target.files[0]));
  els.save.addEventListener('click', saveProject);
  els.load.addEventListener('click', loadProject);
  els.exportDry.addEventListener('click', exportDryStems);
  els.exportMix.addEventListener('click', () => exportRoughMix().catch(showError));
  window.addEventListener('resize', () => requestAnimationFrame(redrawAllWaveforms));
  document.addEventListener('visibilitychange', () => { if (!document.hidden) requestAnimationFrame(redrawAllWaveforms); });

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js').catch(console.warn);
  render();
  setStatus('Ready');
})();
