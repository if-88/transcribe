import { env, pipeline } from "https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2";

env.allowLocalModels = false;
env.useBrowserCache = true;

const state = {
  file: null,
  fileName: "",
  audioData: null,
  transcript: "",
  segments: [],
  recorder: null,
  chunks: [],
  pipe: null,
  pipeModel: "",
  isRecording: false,
};

const els = {
  mediaFile: document.querySelector("#mediaFile"),
  modelSelect: document.querySelector("#modelSelect"),
  minutesTone: document.querySelector("#minutesTone"),
  selectedFileName: document.querySelector("#selectedFileName"),
  transcribeBtn: document.querySelector("#transcribeBtn"),
  demoBtn: document.querySelector("#demoBtn"),
  transcriptOutput: document.querySelector("#transcriptOutput"),
  transcriptMeta: document.querySelector("#transcriptMeta"),
  minutesOutput: document.querySelector("#minutesOutput"),
  progressFill: document.querySelector("#progressFill"),
  progressText: document.querySelector("#progressText"),
  appStatus: document.querySelector("#appStatus"),
  recordBtn: document.querySelector("#recordBtn"),
  stopBtn: document.querySelector("#stopBtn"),
  recordingHint: document.querySelector("#recordingHint"),
  copyTranscriptBtn: document.querySelector("#copyTranscriptBtn"),
  copyMinutesBtn: document.querySelector("#copyMinutesBtn"),
};

const demoTranscript = `
[00:00] Maya: Thanks for joining. The main goal today is to lock our beta launch timing and decide who owns customer onboarding.
[00:08] Eli: Engineering is on track for May 6 if we keep scope fixed and postpone custom exports.
[00:18] Maya: Agreed. Let's defer custom exports and focus on transcript editing, sharing, and action-item generation.
[00:30] Priya: For onboarding, I can draft the first-run guide and record a short walkthrough by next Wednesday.
[00:42] Eli: I also need design review on the upload flow. Jordan, can you send updated copy by Friday?
[00:52] Jordan: Yes, I will send revised copy and empty-state messaging by Friday afternoon.
[01:00] Maya: Great. We decided to target a closed beta on May 6, with onboarding assets complete before then.
[01:10] Priya: One risk is model download size in the browser. We should add a fallback note and recommend shorter recordings for the demo.
[01:21] Maya: Good call. Eli, please add progress states and browser-compatibility notes before the demo branch is shared.
`.trim();

function setStatus(label, kind = "idle") {
  els.appStatus.textContent = label;
  els.appStatus.className = `status-pill ${kind}`;
}

function setProgress(text, percent = 0) {
  els.progressText.textContent = text;
  els.progressFill.style.width = `${Math.max(0, Math.min(100, percent))}%`;
}

function formatSeconds(totalSeconds) {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const minutes = String(Math.floor(seconds / 60)).padStart(2, "0");
  const remainder = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${remainder}`;
}

async function readAudioData(file) {
  const audioContext = new AudioContext({ sampleRate: 16000 });
  const buffer = await file.arrayBuffer();
  const decoded = await audioContext.decodeAudioData(buffer.slice(0));
  const channelData = decoded.numberOfChannels === 1
    ? decoded.getChannelData(0)
    : mixToMono(decoded);

  await audioContext.close();
  return Float32Array.from(channelData);
}

function mixToMono(decoded) {
  const output = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
    const data = decoded.getChannelData(channel);
    for (let i = 0; i < data.length; i += 1) {
      output[i] += data[i] / decoded.numberOfChannels;
    }
  }
  return output;
}

async function ensurePipeline() {
  const model = els.modelSelect.value;
  if (state.pipe && state.pipeModel === model) {
    return state.pipe;
  }

  setStatus("Loading model", "working");
  setProgress("Downloading local transcription model", 12);

  state.pipe = await pipeline("automatic-speech-recognition", model, {
    progress_callback: (update) => {
      const loaded = update?.progress ?? 0;
      setProgress(
        `Loading model assets: ${Math.round(loaded)}%`,
        Math.max(8, loaded),
      );
    },
  });
  state.pipeModel = model;
  return state.pipe;
}

function normalizeTranscript(text) {
  return text.replace(/\s+/g, " ").replace(/\s([,.!?;:])/g, "$1").trim();
}

function buildTranscriptText(chunks, fallbackText) {
  if (!chunks?.length) {
    return fallbackText;
  }

  return chunks
    .map((chunk) => {
      const [start] = chunk.timestamp ?? [0, 0];
      return `[${formatSeconds(start)}] ${normalizeTranscript(chunk.text ?? "")}`;
    })
    .join("\n");
}

function splitSentences(text) {
  return normalizeTranscript(text)
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function topSummarySentences(sentences, maxSentences = 3) {
  if (sentences.length <= maxSentences) {
    return sentences;
  }

  const frequencies = new Map();
  for (const sentence of sentences) {
    for (const token of sentence.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []) {
      frequencies.set(token, (frequencies.get(token) ?? 0) + 1);
    }
  }

  const scored = sentences.map((sentence, index) => {
    const score = (sentence.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? [])
      .reduce((sum, token) => sum + (frequencies.get(token) ?? 0), 0);
    return { sentence, index, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSentences)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);
}

function collectBullets(sentences, pattern, fallback) {
  const items = sentences.filter((sentence) => pattern.test(sentence)).slice(0, 4);
  return items.length ? items : fallback;
}

function generateMinutes(transcriptText) {
  const cleanText = transcriptText.replace(/\[[0-9]{2}:[0-9]{2}\]\s*/g, " ");
  const sentences = splitSentences(cleanText);
  const tone = els.minutesTone.value;
  const summaryCount = tone === "executive" ? 2 : tone === "concise" ? 3 : 4;

  const summary = topSummarySentences(sentences, summaryCount);
  const decisions = collectBullets(
    sentences,
    /\b(decided?|agreed?|approved?|target|launch|defer|postpone)\b/i,
    ["No explicit decisions were confidently detected in this transcript."],
  );
  const nextSteps = collectBullets(
    sentences,
    /\b(will|next step|follow up|please|action|by friday|by monday|by next|need to|can you)\b/i,
    ["Review the transcript and assign owners to follow-up tasks manually."],
  );
  const risks = collectBullets(
    sentences,
    /\b(risk|issue|blocker|concern|dependency|delay|fallback)\b/i,
    ["No major risks were automatically flagged."],
  );

  return {
    summary,
    decisions,
    nextSteps,
    risks,
  };
}

function renderMinutes(minutes) {
  const html = `
    <h3>Meeting summary</h3>
    <p>${minutes.summary.join(" ")}</p>
    <h4>Decisions</h4>
    <ul>${minutes.decisions.map((item) => `<li>${item}</li>`).join("")}</ul>
    <h4>Next steps</h4>
    <ul>${minutes.nextSteps.map((item) => `<li>${item}</li>`).join("")}</ul>
    <h4>Risks and watchouts</h4>
    <ul>${minutes.risks.map((item) => `<li>${item}</li>`).join("")}</ul>
  `;

  els.minutesOutput.classList.remove("empty");
  els.minutesOutput.innerHTML = html;
}

function updateFromTranscript(transcriptText, segments = []) {
  state.transcript = transcriptText;
  state.segments = segments;
  els.transcriptOutput.textContent = transcriptText;
  els.transcriptMeta.textContent = segments.length
    ? `${segments.length} timestamped segments generated locally`
    : "Transcript loaded";
  renderMinutes(generateMinutes(transcriptText));
}

async function transcribeCurrentAudio() {
  if (!state.audioData) {
    return;
  }

  setStatus("Transcribing", "working");
  setProgress("Preparing local transcription", 18);

  try {
    const asr = await ensurePipeline();
    setProgress("Running Whisper locally in your browser", 42);

    const result = await asr(state.audioData, {
      chunk_length_s: 25,
      stride_length_s: 5,
      return_timestamps: true,
    });

    const transcriptText = buildTranscriptText(result.chunks, normalizeTranscript(result.text ?? ""));
    updateFromTranscript(transcriptText, result.chunks ?? []);
    setProgress("Transcription complete", 100);
    setStatus("Complete", "done");
  } catch (error) {
    console.error(error);
    setStatus("Needs attention", "idle");
    setProgress("Transcription failed in this browser. Try a smaller file or a different format.", 0);
    els.transcriptMeta.textContent =
      "The browser could not decode or process the uploaded media.";
  }
}

async function handleFile(file) {
  state.file = file;
  state.fileName = file.name;
  els.selectedFileName.textContent = `${file.name} (${Math.round(file.size / 1024 / 1024)} MB)`;
  setStatus("Preparing", "working");
  setProgress("Decoding audio locally", 10);

  try {
    state.audioData = await readAudioData(file);
    els.transcribeBtn.disabled = false;
    setStatus("Ready", "idle");
    setProgress("Audio is ready to transcribe", 22);
  } catch (error) {
    console.error(error);
    els.transcribeBtn.disabled = true;
    setStatus("Unsupported file", "idle");
    setProgress("This file could not be decoded in the browser. Try WAV, MP3, or M4A.", 0);
  }
}

async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  const mimeType = MediaRecorder.isTypeSupported("audio/webm")
    ? "audio/webm"
    : "";

  state.chunks = [];
  state.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  state.isRecording = true;
  els.recordBtn.disabled = true;
  els.stopBtn.disabled = false;
  els.recordingHint.textContent = "Recording in progress...";
  setStatus("Recording", "working");
  setProgress("Capturing audio from your microphone", 8);

  state.recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      state.chunks.push(event.data);
    }
  };

  state.recorder.onstop = async () => {
    const blob = new Blob(state.chunks, { type: "audio/webm" });
    const file = new File([blob], `meeting-sample-${Date.now()}.webm`, {
      type: "audio/webm",
    });

    for (const track of stream.getTracks()) {
      track.stop();
    }

    state.isRecording = false;
    els.recordBtn.disabled = false;
    els.stopBtn.disabled = true;
    els.recordingHint.textContent = "Recording saved locally. You can transcribe it now.";
    await handleFile(file);
  };

  state.recorder.start();
}

function stopRecording() {
  if (state.recorder && state.isRecording) {
    state.recorder.stop();
  }
}

async function copyText(text, button) {
  try {
    await navigator.clipboard.writeText(text);
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => {
      button.textContent = original;
    }, 1200);
  } catch (error) {
    console.error(error);
  }
}

els.mediaFile.addEventListener("change", async (event) => {
  const [file] = event.target.files ?? [];
  if (file) {
    await handleFile(file);
  }
});

els.transcribeBtn.addEventListener("click", transcribeCurrentAudio);
els.demoBtn.addEventListener("click", () => {
  updateFromTranscript(demoTranscript, []);
  setProgress("Demo transcript loaded", 100);
  setStatus("Demo ready", "done");
});

els.recordBtn.addEventListener("click", startRecording);
els.stopBtn.addEventListener("click", stopRecording);

els.copyTranscriptBtn.addEventListener("click", () =>
  copyText(state.transcript || els.transcriptOutput.textContent, els.copyTranscriptBtn),
);
els.copyMinutesBtn.addEventListener("click", () =>
  copyText(els.minutesOutput.innerText, els.copyMinutesBtn),
);
