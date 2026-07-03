# VoiceForge に足りていないものの設計ヒント

このファイルは以前 UTF-8/CP932 系の文字化けが混ざっていたため、残っていた構造と現在のプロダクト文脈から、今後の実装判断に使える形へ復元した。

VoiceForge が目指すべきものは、単に波形へ静的なエフェクトをかけるツールではない。入力音声を分解し、聴覚上どこが知覚されるかを見積もり、制作実務としてどの順序で直し、最後にキャラクター方向へ安全に動かす「ブラウザ内 Voice Studio」である。

## 1. 大きな層

### 物理・音響

- 音圧、波形、スペクトル、帯域、位相、声門、声道を見る。
- 波形だけを見ると時間変化やトランジェントが見える。
- スペクトルを見ると帯域バランス、位相、ノイズ、フォルマントらしさが見える。
- どちらか一方では足りない。Studio Polish は時間領域と周波数領域を併用するべき。

### 聴覚心理

- 耳は FFT のビン単位で音を聴いていない。
- Bark、ERB、mel、phon、sone、マスキング、時間マスキング、同時マスキングを意識する。
- 声の「痛さ」「こもり」「鼻っぽさ」「明るさ」は、単純なピークではなく知覚帯域の混み具合として扱うほうが自然。

### 音声生成

- 声は Source-Filter Theory で考える。
- Source は声帯振動、F0、有声音、声門流、ジッター、シマー、HNR、spectral tilt。
- Filter は声道、口腔、鼻腔、舌、顎、唇が作るフォルマントと帯域幅。
- ボイスチェンジは pitch だけではなく source と filter を分けて扱う必要がある。

### DSP

- FFT/STFT/ISTFT、FIR/IIR、LPC、cepstrum、wavelet、OLA/SOLA/WSOLA/PSOLA、phase vocoder、Wiener、spectral subtraction、adaptive filter を設計候補として持つ。
- ただし全部を一つの巨大処理にしない。問題別の処理として分け、最後にワークフローとして接続する。

### 制作実務

- 録音、ゲイン、修復、EQ、de-ess、compression、saturation、limiter、loudness、A/B、export の順序が大事。
- 入力が悪いと後段のアルゴリズムが全部壊れる。最初に source quality と repair map を見る。
- 「良い声」はキャラクター変換以前に、聴きやすく、痛くなく、ノイズや鼻音が気にならず、音量が安定している必要がある。

## 2. 重要な設計前提

### 静的プリセットだけでは足りない

同じ Kawaii や Ikemen でも、元声が低い、明るい、鼻に寄る、歯擦音が強い、部屋鳴りがある、声量が小さい、という条件で必要な処理は変わる。

実装は次の形に寄せる。

1. 入力を分析する。
2. 問題を局所、帯域、時間、知覚の層に分ける。
3. 修復と補正を source-adaptive に決める。
4. キャラクターマクロは安全域の中で動かす。
5. Render Deck と QC で、本当に保存してよいテイクだけを Keeper にする。

### 処理は層で分ける

- Input / DC / HPF
- VAD / noise floor / active speech
- F0 / voiced-unvoiced / pitch range
- spectral envelope / LPC / formant-like evidence
- micro repair / plosive / mouth click / sibilance
- tone surgery / dynamic EQ
- de-ess
- level ride / compression
- character transform
- mastering / loudness / true peak
- export / A/B / notes

### 各処理には「やりすぎると壊れる」がある

- Mouth click repair: 強すぎると子音や舌の音を削ってリスプっぽくなる。
- De-plosive: 強すぎると胴鳴りや語頭の説得力が消える。
- Noise reduction: 強すぎるとポンピング、水っぽさ、無音の不自然さが出る。
- De-ess: 強すぎると濡れたようなサ行、抜けない声になる。
- Compression: 強すぎると平坦で疲れる。
- Pitch/formant: 強すぎるとニュース番組の匿名加工声やロボットっぽさになる。
- Breath/whisper: 足しすぎるとノイズ、歯擦音、安い ASMR 感になる。

この「過処理リスク」は UI と export notes に出すべき。

## 3. 今の VoiceForge に特に必要な方向

### Source Reactive Control

入力系列の形に反応する処理を増やす。

- mouth click は短い高帯域パルスとして検出し、周辺子音を保ったまま局所補間する。
- plosive は低域バーストとして検出し、語頭全体ではなく局所低域だけを抑える。
- sibilance は高帯域の持続成分として検出し、母音の明るさを残して split-band ducking する。
- level ride はフレーズ単位で動かし、無音ピークだけで不自然に上下させない。
- room floor は hard gate ではなく downward expander として扱う。

### Perceptual Tone Map

FFT peak だけではなく ERB/Bark 的な知覚帯域で tone risk を見る。

- 150-420 Hz: mud / boxiness
- 650-1350 Hz: nasal / honk
- 2.5-4.5 kHz: harsh / painful presence
- 5.2-11 kHz: sibilance / edge
- 9-16 kHz: air / breath

Kawaii は明るさが必要だが harshness と sibilance を増やしてはいけない。Ikemen は単に低域を増やすのではなく、100-250 Hz の body、1-3 kHz の存在感、5-8 kHz の艶を分けて扱う。

### Prosody And Performance

乙女ゲーム風、イケボ、カワボ、アニメ声は声色だけではなく演技で決まる。

- 語尾の抜き方
- 母音の伸ばし
- 息の混ざり方
- 近接感
- 抑揚
- 間
- 子音の柔らかさ
- 口角が上がったような明るさ

非 AI で完全な別人級は難しいが、Performance Script / Acting Automation / Scene Kit として UI に組み込む価値がある。

### Take Decision

「一番キャラに近い」だけで Keeper にしてはいけない。

Keeper は次を満たす必要がある。

- clipping しない。
- true peak に余裕がある。
- listening comfort が risk ではない。
- render speed が実用範囲。
- source/target/script の根拠がある。
- export notes に判断理由が残る。

壊れた候補は Keeper ではなく QC Hold として扱い、修復してから再レンダーする。

## 4. 古典 DSP 候補

### Pitch / Formant

- Autocorrelation / YIN / pYIN / SWIPE / AMDF
- dynamic programming tracking
- SOLA / WSOLA / PSOLA
- phase vocoder with phase locking
- LPC envelope
- cepstral envelope
- harmonic plus noise model

短期的には source-adaptive guardrail と macro safety が重要。中長期では WSOLA/PSOLA や WASM ライブラリを検討する。

### Repair

- spectral subtraction
- Wiener filter
- dynamic EQ
- adaptive de-ess
- local impulse interpolation
- downward expander
- transient-aware ducking

AI ノイズ除去の代替には届かないが、問題を限定すればブラウザ内 DSP でも実用的な補正はできる。

### Optimization

単純なプリセット値ではなく、目的関数を持つ。

- loudness target
- true peak ceiling
- comfort score
- micro event density
- spectral crowding
- character target match
- performance trace match
- render time budget

最適化候補:

- bounded coordinate search
- simulated annealing
- greedy repair pass
- dynamic programming for F0 / phrase tracking
- constraint-based guardrails

過度な探索はブラウザ体験を壊すため、短い cue preview と render budget に結びつける。

## 5. UI に落とすべき形

ユーザーは DSP の専門用語を全部知る必要はない。だがソフトウェアは内部で専門的に考えるべき。

画面は次を明確にする。

- 今の source は録音として何が悪いか。
- clean/polish で何を直すか。
- character は何を変えるか。
- 変えすぎると何が壊れるか。
- いま保存してよい keeper なのか、QC hold なのか。
- 次に押すべきボタンは何か。
- export には判断根拠が残るか。

この意味で、Director Brief / Studio Plan / Render Deck / Take Decision / Export Notes は同じ制作判断の別ビューである。

## 6. AI 後段の位置づけ

RVC や modern VC は speaker identity conversion を超えられるが、GitHub Pages 静的サイトではモデルサイズ、WebGPU/ONNX 対応、初回ロード、ライセンス、遅延が重い。

AI は後段でよい。まず非 AI の Studio Polish、source-reactive repair、prosody macro、QC、export、A/B を限界まで作る。その上で「別人級に足りない部分」を Research Matrix に明示する。

## 7. 実装チェックリスト

- Source analysis: loudness, true peak, F0, voiced ratio, brightness, spectral risks, micro events.
- Timeline: active cue, preview cue, longform split.
- Studio Polish: repair map, micro repair, room shaper, tone surgery, de-ess, level ride, mastering.
- Character: source-adaptive limits, pitch/formant/breath/air/body/consonant softness guardrails.
- Performance: script lanes, automation frames, trace comparison.
- Decision: render review, listening comfort, take QC, keeper refinement.
- Export: WAV, WebM, ZIP, A/B loudness matched files, research notes, take-decision notes.
- Browser verification: upload/load source, analyze, preview, repair, render, export, console errors.
