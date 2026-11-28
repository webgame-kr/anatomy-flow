// Anatomy Search: 한글·영문·동의어·해부학 ID·FMA ID 검색 (부분 일치, 영문 대소문자 무시)

function norm(text) {
  return String(text || '').toLowerCase().replace(/[\s_\-·.,()]/g, '');
}

export function createAnatomySearch({ anatomy }) {
  function fields(s) {
    return [
      { kind: 'ko', text: s.name_ko },
      { kind: 'en', text: s.name_en },
      ...s.aliases.map((a) => ({ kind: 'alias', text: a })),
      { kind: 'id', text: s.anatomical_id },
      { kind: 'fma', text: s.fma_id || '' },
    ];
  }

  function search(query, limit = 30) {
    const q = norm(query);
    if (!q) return [];
    const results = [];
    for (const s of anatomy.list()) {
      let best = 0;
      let matched = null;
      for (const f of fields(s)) {
        const t = norm(f.text);
        if (!t) continue;
        let score = 0;
        if (t === q) score = 100;
        else if (t.startsWith(q)) score = 70;
        else if (t.includes(q)) score = 40;
        if (score && f.kind === 'alias') score -= 5;
        if (score > best) { best = score; matched = f; }
      }
      if (best) {
        results.push({ id: s.anatomical_id, score: best, matched: matched.kind, matchedText: matched.text,
          name_ko: s.name_ko, name_en: s.name_en, status: anatomy.status(s.anatomical_id) });
      }
    }
    results.sort((a, b) => b.score - a.score || a.name_ko.length - b.name_ko.length);
    return results.slice(0, limit);
  }

  return { search, norm };
}
