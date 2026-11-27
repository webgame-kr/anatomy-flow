# 기록 엔진: 학습 기록 계산과 CSV 문자열 만들기

CSV_HEADER = ['날짜', '콘텐츠', '제목', '완료', '정답', '오답', '정답률(%)', '이동', '시간(초)']


def accuracy(correct, wrong):
    total = correct + wrong
    if total == 0:
        return 0.0
    return round(correct / total * 100, 1)


def make_record(content, state, date_text, seconds):
    # 한 판의 기록 dict
    record = {}
    record['date'] = date_text
    record['content_id'] = content['id']
    record['title'] = content['title']
    record['finished'] = (state['end_reason'] == 'goal')
    record['correct'] = state['correct']
    record['wrong'] = state['wrong']
    record['accuracy'] = accuracy(state['correct'], state['wrong'])
    record['steps'] = state['steps']
    record['seconds'] = round(seconds, 1)
    return record


def clean(value):
    # CSV 칸에 쉼표나 줄바꿈이 들어가면 칸이 깨지므로 바꿔 준다
    text = str(value)
    text = text.replace(',', ' ')
    text = text.replace('\n', ' ')
    return text


def to_csv(records):
    # 기록 리스트를 CSV 문자열로 (10장 split/join 방식)
    lines = [','.join(CSV_HEADER)]
    for rec in records:
        if rec.get('finished'):
            done = 'Y'
        else:
            done = 'N'
        row = [rec.get('date', ''), rec.get('content_id', ''), rec.get('title', ''), done,
               rec.get('correct', 0), rec.get('wrong', 0), rec.get('accuracy', 0),
               rec.get('steps', 0), rec.get('seconds', 0)]
        cells = []
        for value in row:
            cells.append(clean(value))
        lines.append(','.join(cells))
    return '\n'.join(lines) + '\n'


def summary(records):
    # 콘텐츠별 최고 정답률 (딕셔너리 집계)
    best = {}
    for rec in records:
        key = rec.get('content_id', '')
        if key not in best or rec.get('accuracy', 0) > best[key]:
            best[key] = rec.get('accuracy', 0)
    return best
