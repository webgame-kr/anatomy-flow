# 기록 엔진: 학습 기록 계산과 CSV 문자열 만들기

CSV_HEADER = ['날짜', '콘텐츠', '제목', '완료', '정답', '오답', '정답률(%)', '이동', '시간(초)']


# STEP 03-D 기록 (v2) 열
CSV_HEADER_V2 = ['session_id', 'content_id', 'content_version', 'learning_mode', 'start_time', 'end_time',
                 'active_learning_time(s)', 'correct_count', 'wrong_count', 'accuracy(%)',
                 'first_attempt_correct_count', 'question_count', 'first_attempt_accuracy(%)',
                 'hint_count', 'completed_nodes', 'attempted_answers', 'completion_status']


def ratio(part, whole):
    # 백분율. 분모가 0이면 0
    if whole == 0:
        return 0.0
    return round(part / whole * 100, 1)


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


def make_record_v2(content, state, info):
    # 정답률 정의
    #   전체 시도 정답률 = 정답 제출 수 / (정답 제출 수 + 오답 제출 수)
    #   첫 시도 정답률 = 오답 없이 맞힌 문제 수 / 맞힌 문제 수 (복습 노드 재방문은 제외)
    record = {}
    record['version'] = 2
    for key in ['session_id', 'learning_mode', 'start_time', 'end_time', 'completion_status']:
        record[key] = info.get(key, '')
    record['active_learning_time'] = round(info.get('active_seconds', 0), 1)
    record['content_id'] = content['id']
    record['content_version'] = content.get('content_version', '')
    record['title'] = content['title']
    record['correct_count'] = state['correct']
    record['wrong_count'] = state['wrong']
    record['accuracy'] = accuracy(state['correct'], state['wrong'])
    record['first_attempt_correct_count'] = state['first_correct']
    record['question_count'] = state['questions']
    record['first_attempt_accuracy'] = ratio(state['first_correct'], state['questions'])
    record['hint_count'] = state['hints']
    record['completed_nodes'] = list(state['completed'])
    answers = []
    for item in state['attempts']:
        answers.append({'nodes': list(item[0]), 'text': item[1], 'result': item[2]})
    record['attempted_answers'] = answers
    wrong = []
    for node_id in state['wrong_nodes']:
        wrong.append(node_id)
    record['wrong_nodes'] = wrong
    return record


def to_csv_v2(records):
    # v2 기록 CSV. 목록 칸은 세미콜론(;)으로 잇는다. v1 기록은 빈칸을 채워 함께 내보낸다
    lines = [','.join(CSV_HEADER_V2)]
    for rec in records:
        if rec.get('version') != 2:
            rec = from_v1(rec)
        texts = []
        for item in rec.get('attempted_answers', []):
            texts.append('{}={}'.format(item.get('text', ''), item.get('result', '')))
        row = [rec.get('session_id', ''), rec.get('content_id', ''), rec.get('content_version', ''),
               rec.get('learning_mode', ''), rec.get('start_time', ''), rec.get('end_time', ''),
               rec.get('active_learning_time', 0), rec.get('correct_count', 0), rec.get('wrong_count', 0),
               rec.get('accuracy', 0), rec.get('first_attempt_correct_count', ''), rec.get('question_count', ''),
               rec.get('first_attempt_accuracy', ''), rec.get('hint_count', ''),
               ';'.join(rec.get('completed_nodes', [])), ';'.join(texts), rec.get('completion_status', '')]
        cells = []
        for value in row:
            cells.append(clean(value))
        lines.append(','.join(cells))
    return '\n'.join(lines) + '\n'


def from_v1(rec):
    # v0.1 기록(날짜, 정답, 오답 ...)을 v2 열 이름에 맞춘다. 없는 값은 빈칸
    result = {'version': 1}
    result['session_id'] = ''
    result['content_id'] = rec.get('content_id', '')
    result['start_time'] = rec.get('date', '')
    result['active_learning_time'] = rec.get('seconds', 0)
    result['correct_count'] = rec.get('correct', 0)
    result['wrong_count'] = rec.get('wrong', 0)
    result['accuracy'] = rec.get('accuracy', 0)
    if rec.get('finished'):
        result['completion_status'] = 'completed'
    else:
        result['completion_status'] = 'unfinished'
    return result


def summary(records):
    # 콘텐츠별 최고 정답률 (딕셔너리 집계)
    best = {}
    for rec in records:
        key = rec.get('content_id', '')
        if key not in best or rec.get('accuracy', 0) > best[key]:
            best[key] = rec.get('accuracy', 0)
    return best
