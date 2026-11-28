// Signal Manager (STEP 04-C): 생리 신호(신경 신호·호르몬·효소)를 경로를 따라 보여 주는 명령 처리기
// - 명령: { action: 'signal_emit', target: actor_id, signal_id, signal_type, path_id, from, to, duration, style, wait }
//   Python(physiology_commands)이 만든다. 여기서는 보여 주기만 하고 생리 상태를 바꾸지 않는다(상태 → 시각 한 방향).
// - 기존 Actor·Path 엔진을 쓴다: 신호 Actor를 출발 Checkpoint에 놓고, 도착 Checkpoint까지 이동한 뒤 다시 숨긴다.
// - 신경 신호(전기적)와 호르몬(혈류)은 색·모양(Actor 모델)으로 구분한다. 크기·속도는 교육용 표시다.
// - 애니메이션 줄이기: 이동 없이 도착 위치에 잠깐 보였다가 숨긴다.

const TYPES = ['neural_afferent', 'neural_efferent', 'hormone', 'enzyme', 'neurotransmitter', 'paracrine', 'electrical'];
const MAX_LOG = 40;

export function createSignalManager({ kit, materials, registry, log = () => {} }) {
  const signalActors = new Set();
  const recent = [];
  let reduced = false;
  let session = 0;

  function setSignalActors(ids) {
    signalActors.clear();
    for (const id of ids || []) signalActors.add(id);
    hideIdle();
  }

  function hideIdle() {
    for (const id of signalActors) if (registry.has(id)) materials.setVisible(id, false);
  }

  function validate(cmd) {
    if (!TYPES.includes(cmd.signal_type)) return `알 수 없는 신호 종류: ${cmd.signal_type}`;
    if (!kit.actors.has(cmd.target)) return `없는 신호 Actor: ${cmd.target}`;
    if (!kit.paths.findCheckpoint(cmd.from)) return `없는 출발 Checkpoint: ${cmd.from}`;
    if (!kit.paths.findCheckpoint(cmd.to)) return `없는 도착 Checkpoint: ${cmd.to}`;
    return '';
  }

  async function run(cmd) {
    const id = cmd.target;
    const my = session;
    const style = cmd.style || {};
    recent.push({ signal_id: cmd.signal_id, signal_type: cmd.signal_type, at: performance.now() });
    if (recent.length > MAX_LOG) recent.shift();
    materials.setVisible(id, true);
    if (style.color) materials.setColor(id, style.color);
    const placed = await kit.commands.run({ action: 'actor_place_at_checkpoint', target: id, checkpoint_id: cmd.from });
    if (placed && placed.status === 'failed') { materials.setVisible(id, false); return placed; }
    let out = { status: 'completed' };
    if (reduced) {
      await kit.commands.run({ action: 'actor_place_at_checkpoint', target: id, checkpoint_id: cmd.to });
      await new Promise((r) => setTimeout(r, 250));
    } else {
      out = await kit.commands.run({ action: 'actor_move_to_checkpoint', target: id, checkpoint_id: cmd.to, duration: Math.max(150, cmd.duration || 900) });
    }
    if (session === my) materials.setVisible(id, false);
    if (out && (out.status === 'arrived' || out.status === 'ok')) return { status: 'completed' };
    if (out && out.status === 'failed') log(`신호 표시 실패: ${cmd.signal_id} (${out.reason || ''})`, 'warn');
    return out || { status: 'completed' };
  }

  return {
    handles: (action) => action === 'signal_emit',
    validate,
    run,
    setSignalActors,
    hideIdle,
    setReducedMotion(on) { reduced = !!on; },
    cancelAll() { session += 1; hideIdle(); },
    get recent() { return recent.slice(); },
  };
}
