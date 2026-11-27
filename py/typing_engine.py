# 타이핑 엔진: 입력 정규화, 허용 정답 비교


def normalize(text, ignore_spaces=False):
    # 앞뒤 공백 제거, 가운데 여러 칸 공백은 한 칸으로, 영문은 소문자로
    if text == None:
        return ''
    words = str(text).split()
    if ignore_spaces:
        result = ''.join(words)      # 공백을 모두 없앤다
    else:
        result = ' '.join(words)     # 공백 한 칸으로 맞춘다
    return result.lower()


def is_correct(text, answers, ignore_spaces=False):
    # 입력이 허용 정답 중 하나와 같으면 True
    user = normalize(text, ignore_spaces)
    if user == '':
        return False
    for ans in answers:
        if normalize(ans, ignore_spaces) == user:
            return True
    return False


def find_choice(text, candidates, nodes, ignore_spaces=False):
    # candidates = [[edge_id, node_id], ...]
    # 입력과 맞는 후보를 찾아 돌려준다. 없으면 None
    for cand in candidates:
        node = nodes[cand[1]]
        if is_correct(text, node['answers'], ignore_spaces):
            return cand
    return None
