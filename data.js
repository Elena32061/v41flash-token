// Numbers behind the charts. Sources in comments; ✅ = measured / code, 🔶 = estimate.
window.HBM = {
  total: 185, memFrac: 0.87 * 185, // ✅ nvidia-smi usable 185 GiB; mem_fraction_static 0.87
  parts: [
    { name: 'Engram 表（1/4 行）', short: 'Engram', v: 47.2, color: '--hbm', src: '188.8 GiB ÷ 4（✅ engram.py 行切分）' },
    { name: 'routed experts（每个 expert 的 1/4，576→640 列补齐）', short: 'experts', v: 74.7, color: '--sm', src: '384×40×5.22 MB（✅ 代码：intermediate 补齐到 128 的倍数）' },
    { name: '其余权重（attention、shared expert、embedding、lm_head、对齐 padding…）', short: '其余', v: 147.07 - 47.2 - 74.7, color: '--cpu', src: '147.07 − 前两项（attention 1.75、lm_head 0.31、embedding、shared expert、Engram 投影…；已知各项合计约 4 GiB，仍有约 20 GiB 未对上 🔶）' },
    { name: 'decode CUDA graph', short: 'graph', v: 1.9, color: '--nv', src: '启动日志（✅）' },
    { name: 'KV + SWA 池', short: 'KV', v: 11.2, color: '--kv', src: '161 − 147.07 − 1.9 − 0.8（🔶 按阶段增量估）' },
    { name: 'mem_fraction 之外：激活、NCCL、workspace', short: '其他', v: 185 - 0.87 * 185 + 0.8, color: '--idle', ghost: true, src: '(1 − 0.87) × 185 + 0.8 GiB 余量（🔶）' },
  ],
};

(function () {
  // routed expert bytes per expert per GPU per layer (TP4): intermediate 2304/4 = 576, padded to 640
  // (mxfp4_flashinfer_trtllm_moe.py:50 _pad_intermediate_size) → 3×5120×640 FP4 + 1 B scale / 32 = 5.22 MB ✅
  const E_LAYER_MB = 5.22, E_STEP_GB = E_LAYER_MB * 40 / 1000;
  const U = b => 384 * (1 - Math.pow(1 - 6 / 384, b));
  const moe = b => U(b) * E_STEP_GB / 8; // GB / 8 TB/s → ms (peak bandwidth, lower bound) 🔶
  window.SCALE = {
    U, moe, pred: b => 3.20 + moe(b) - moe(1), tpCap: 135,
    meas: [{ bs: 1, v: 3.20 }, { bs: 128, v: 12.71 }],
    rows: [1, 4, 8, 16, 32, 64, 128, 256, 512],
  };
})();

// 40 layers, 0-index — table verified in facts/attention.md A1 (models/deepseek_v4.py:1148-1164, memory_pool.py:1631-1658)
window.LAYERS = Array.from({ length: 40 }, (_, l) => {
  const ratio = l < 2 ? 0 : l < 20 ? 2 : 1;
  const kvsrc = [2, 8, 14, 20].includes(l);
  const full = [2, 8, 14, 20].includes(l), reindex = [24, 28, 32, 36].includes(l);
  const engram = [1, 14].includes(l);
  const prev = (arr) => arr.filter(x => x <= l).pop();
  const kvFrom = ratio === 2 ? prev([2, 8, 14]) : ratio === 1 ? 20 : null;
  const topkFrom = ratio === 2 ? prev([2, 8, 14]) : ratio === 1 ? prev([20, 24, 28, 32, 36]) : null;
  const kind = ratio === 0 ? 'swa' : full ? 'full' : reindex ? 'reindex' : 'reuse';
  let text = (l < 20 ? 'encoder' : 'decoder') + ' · 自己的 SWA（最近 128 token）';
  if (ratio === 0) text += ' · 没有压缩 KV，只看 SWA';
  else {
    text += ` · 压缩比 m=${ratio}`;
    text += kvsrc ? ' · <b>KV source</b>：本层压缩器写 global KV + 68 B index key' : ` · global KV 读第 ${kvFrom} 层那份`;
    if (full) text += ' · indexer <b>Full</b>：给全部可见条目打分选 top-512' + (l === 20 ? '，并发布候选池（2048 块×8）' : '');
    else if (reindex) text += ' · indexer <b>Reindex</b>：用自己的 q 给第 20 层的 key 在候选池里打分';
    else text += ` · 复用第 ${topkFrom} 层选出的 top-512`;
  }
  if (engram) text += ' · <b>Engram</b> 查表（在 attention 之前）';
  return { l, ratio, kvsrc, full, reindex, engram, kind, kvFrom, topkFrom, text };
});

// bs1 time budget per GPU — everything except the 3.20 ms total is an estimate (🔶)
// HBM floors = bytes / 8 TB/s. Sources: facts/attention.md A3, facts/moe.md M4–M6, facts/runtime.md R5.
window.BUDGET = {
  total: 3.20,
  parts: [
    { name: 'attention 权重 1.96 GB', v: 0.245, color: '--sm' },
    { name: 'routed experts 6×40×5.22 MB', v: 0.157, color: '--hbm' },
    { name: 'shared expert + router + mHC + Engram 投影', v: 0.125, color: '--cpu' },
    { name: 'lm_head 331 MB', v: 0.041, color: '--token' },
    { name: 'KV / index key 21.6 MB', v: 0.003, color: '--kv' },
    { name: '84 次 collective（按 5–10 µs/次）', v: 0.63, color: '--nv' },
    { name: '没拆开的部分：上千个小 kernel 的串行延迟、多流同步、图外 metadata', v: 3.20 - 0.245 - 0.157 - 0.125 - 0.041 - 0.003 - 0.63, color: '--idle', ghost: true },
  ],
};
