"""Build pinned character tables. Runtime uses no Python, network or normalize()."""
import argparse
import base64
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request
import zipfile
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / 'data'
UNICODE = '18.0.0'
OPENCC = '025f371dc76b598d77384fbdab90c937471844d8'
UNIHAN_HASH = '4c93ea9c1f636451729a840978f1667a53886af37ba854fdcce109721c63d43e'
ALLOWED = {'kSimplifiedVariant', 'kTraditionalVariant', 'kJapaneseNewVariant', 'kJapaneseOldVariant', 'kZVariant'}
FIELDS = ALLOWED | {'kSemanticVariant', 'kSpecializedSemanticVariant', 'kSpoofingVariant'}
DICTIONARIES = ['STCharacters.txt', 'TSCharacters.txt', 'TWVariants.txt', 'HKVariants.txt', 'JPShinjitaiCharacters.txt']
EAST_BLOCKS = {'CJK Radicals Supplement', 'Kangxi Radicals', 'CJK Symbols and Punctuation',
               'Enclosed CJK Letters and Months', 'CJK Compatibility', 'CJK Compatibility Forms',
               'Vertical Forms', 'Small Form Variants', 'Halfwidth and Fullwidth Forms'}
EAST_SCRIPTS = {'Han', 'Hiragana', 'Katakana', 'Hangul'}


def scalar(value):
    number = int(value.removeprefix('U+'), 16)
    if not 0 <= number <= 0x10FFFF or 0xD800 <= number <= 0xDFFF:
        raise ValueError('Invalid Unicode scalar: ' + value)
    return chr(number)


def lines(text):
    for number, line in enumerate(text.splitlines(), 1):
        body = line.split('#', 1)[0].strip()
        if body:
            yield number, body


def relation(a, b, field, file, included) -> dict:
    return dict(source=a, target=b, field=field, file=file, included=included)


def parse_unihan(text, source):
    result = []
    for number, line in lines(text):
        parts = line.split('\t')
        if len(parts) != 3 or parts[1] not in FIELDS:
            raise ValueError(f'{source}:{number}: unexpected variant record')
        a, field, values = parts
        for token in values.split():
            target = token.split('<', 1)[0]
            if not re.fullmatch(r'U\+[0-9A-F]{4,6}', target):
                raise ValueError(f'{source}:{number}: invalid target')
            result.append(relation(scalar(a), scalar(target), field, source, field in ALLOWED))
    return result


def parse_opencc(text, source):
    result = []
    for number, line in lines(text):
        parts = line.split('\t')
        if len(parts) != 2 or len(parts[0]) != 1 or not parts[1].split():
            raise ValueError(f'{source}:{number}: expected character record')
        for target in parts[1].split():
            if len(target) != 1 or any(0xD800 <= ord(c) <= 0xDFFF for c in parts[0] + target):
                raise ValueError(f'{source}:{number}: non-scalar or phrase record')
            result.append(relation(parts[0], target, source.removesuffix('.txt'), source, True))
    return result


def verify_file(path, expected_sha256):
    content = Path(path).read_bytes()
    if hashlib.sha256(content).hexdigest() != expected_sha256:
        raise ValueError(f'{path}: upstream-checksum-mismatch')
    return content


def build_modes(relations, decompositions, east_asian_sources):
    result = {}
    for mode in ['eastAsian', 'full']:
        decomp = {a: b for a, b in decompositions.items() if mode == 'full' or a in east_asian_sources}
        parent = {}

        def find(a):
            parent.setdefault(a, a)
            while parent[a] != a:
                parent[a] = parent[parent[a]]
                a = parent[a]
            return a

        def union(a, b):
            a, b = find(a), find(b)
            if a != b:
                parent[max(a, b)] = min(a, b)

        for row in relations:
            if row['included']:
                union(row['source'], row['target'])
        for a, b in decomp.items():
            find(a)
            if len(b) == 1:
                union(a, b)
            for c in b:
                find(c)
        groups = defaultdict(list)
        for a in list(parent):
            groups[find(a)].append(a)
        sequences = defaultdict(set)
        for a, b in decomp.items():
            if len(b) > 1:
                sequences[find(a)].add(b)
        cache, visiting = {}, set()

        def canonical(key):
            key = find(key)
            if key in cache:
                return cache[key]
            if key in visiting:
                raise ValueError('Decomposition cycle at U+' + f'{ord(key):04X}')
            visiting.add(key)
            values = {''.join(canonical(c) for c in text) for text in sequences[key]}
            if len(values) > 1:
                raise ValueError(f'Conflicting canonical sequences for {groups[key]!r}: {sorted(values)!r}')
            answer = next(iter(values)) if values else key
            visiting.remove(key)
            cache[key] = answer
            return answer

        entries = []
        for key in sorted(groups):
            value = canonical(key)
            members = sorted(groups[key])
            if len(members) > 1 or sequences[key]:
                entries.extend([a, value] for a in members)
        result[mode] = {'entries': sorted(entries)}
    return result


def sources():
    rows = []
    for name in ['Unihan.zip', 'UnicodeData.txt', 'EquivalentUnifiedIdeograph.txt', 'Scripts.txt', 'Blocks.txt']:
        rows.append(dict(name=name, url=f'https://www.unicode.org/Public/{UNICODE}/ucd/{name}'))
    rows.append(dict(name='Unicode-LICENSE.txt', url='https://www.unicode.org/license.txt'))
    for name in DICTIONARIES:
        rows.append(dict(name=name, github=f'data/dictionary/{name}',
                         url=f'https://raw.githubusercontent.com/BYVoid/OpenCC/{OPENCC}/data/dictionary/{name}'))
    rows.append(dict(name='OpenCC-LICENSE.txt', github='LICENSE',
                     url=f'https://raw.githubusercontent.com/BYVoid/OpenCC/{OPENCC}/LICENSE'))
    # NOTICE existence is checked explicitly at the pinned commit when fetching.
    return rows


def download(row):
    if 'github' in row:
        payload = json.loads(subprocess.check_output(
            ['gh', 'api', f'repos/BYVoid/OpenCC/contents/{row["github"]}?ref={OPENCC}'], timeout=60))
        if payload.get('type') != 'file' or payload.get('encoding') != 'base64':
            raise ValueError('Unexpected GitHub response for ' + row['name'])
        return base64.b64decode(payload['content'])
    request = urllib.request.Request(row['url'], headers={'User-Agent': 'CJK-Search-data-builder/0.1'})
    with urllib.request.urlopen(request, timeout=60) as response:
        content = response.read(32 * 1024 * 1024 + 1)
    if len(content) > 32 * 1024 * 1024:
        raise ValueError('Upstream size limit: ' + row['name'])
    return content


def fetch_sources():
    upstream = DATA / 'upstream'
    upstream.mkdir(parents=True, exist_ok=True)
    lock_path = DATA / 'sources.lock.json'
    existing = json.loads(lock_path.read_text()) if lock_path.exists() else None
    expected = {r['name']: r for r in existing['files']} if existing else {}
    rows = sources()
    listing = json.loads(subprocess.check_output(
        ['gh', 'api', f'repos/BYVoid/OpenCC/contents?ref={OPENCC}'], timeout=60))
    notice_present = any(row['name'] == 'NOTICE' for row in listing)
    if notice_present:
        rows.append(dict(name='OpenCC-NOTICE.txt', github='NOTICE',
                         url=f'https://raw.githubusercontent.com/BYVoid/OpenCC/{OPENCC}/NOTICE'))
    locked = []
    for row in rows:
        path = upstream / row['name']
        if row['name'] in expected and path.exists():
            content = verify_file(path, expected[row['name']]['sha256'])
        else:
            content = download(row)
        digest = hashlib.sha256(content).hexdigest()
        if row['name'] == 'Unihan.zip' and digest != UNIHAN_HASH:
            raise ValueError('Unihan differs from previously verified 18.0.0 evidence')
        if existing and (row['name'] not in expected or digest != expected[row['name']]['sha256']):
            raise ValueError('Refusing source lock change: ' + row['name'])
        temporary = path.with_suffix(path.suffix + '.part')
        temporary.write_bytes(content)
        temporary.replace(path)
        locked.append(dict(**row, sha256=digest, bytes=len(content)))
        print(f'FETCHED {row["name"]} {len(content)} bytes {digest}', flush=True)
    lock = dict(schema=1, unicodeVersion=UNICODE, openccVersion='1.4.2', openccCommit=OPENCC,
                openccNoticePresent=notice_present, files=locked)
    if existing and lock != existing:
        raise ValueError('Source manifest changed; refusing automatic relock')
    if not existing:
        write_output(lock_path, json_bytes(lock))


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=2) + '\n').encode('utf-8')


def write_output(path, content):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temp = path.with_name(path.name + '.tmp')
    temp.write_bytes(content)
    os.replace(temp, path)


def read_inputs():
    lock = json.loads((DATA / 'sources.lock.json').read_text())
    if (lock.get('schema'), lock.get('unicodeVersion'), lock.get('openccCommit')) != (1, UNICODE, OPENCC):
        raise ValueError('Unsupported source lock')
    expected = {row['name'] for row in sources()}
    names = [row['name'] for row in lock['files']]
    if len(names) != len(set(names)) or set(names) != expected | ({'OpenCC-NOTICE.txt'} if lock['openccNoticePresent'] else set()):
        raise ValueError('Incomplete or unexpected source lock')
    blobs = {row['name']: verify_file(DATA / 'upstream' / row['name'], row['sha256']) for row in lock['files']}
    with zipfile.ZipFile(io.BytesIO(blobs.pop('Unihan.zip'))) as archive:
        info = archive.getinfo('Unihan_Variants.txt')
        if info.file_size > 16 * 1024 * 1024:
            raise ValueError('Variants file size limit')
        blobs['Unihan_Variants.txt'] = archive.read(info)
    texts = {name: content.decode('utf-8-sig') for name, content in blobs.items()}
    for name in ['Unihan_Variants.txt', 'EquivalentUnifiedIdeograph.txt', 'Scripts.txt', 'Blocks.txt']:
        if UNICODE not in '\n'.join(texts[name].splitlines()[:20]):
            raise ValueError('Unexpected Unicode version header: ' + name)
    return lock, texts


def ranges(text):
    rows = []
    for number, line in lines(text):
        parts = [v.strip() for v in line.split(';')]
        if len(parts) != 2:
            raise ValueError(f'Invalid property line {number}')
        ends = parts[0].split('..')
        if len(ends) > 2 or not all(re.fullmatch(r'[0-9A-F]{4,6}', end) for end in ends):
            raise ValueError(f'Invalid property range at line {number}')
        start, end = int(ends[0], 16), int(ends[-1], 16)
        # Blocks.txt includes surrogate blocks; property bounds are not scalars.
        if not 0 <= start <= end <= 0x10FFFF:
            raise ValueError(f'Invalid property bounds at line {number}')
        rows.append((start, end, parts[1]))
    return rows


def build(output):
    lock, texts = read_inputs()
    records = parse_unihan(texts['Unihan_Variants.txt'], 'Unihan_Variants.txt')
    if not {row['field'] for row in records}.issuperset(ALLOWED):
        raise ValueError('Required Unihan fields missing')
    japanese = {frozenset((row['source'], row['target'])) for row in records if row['field'] in {'kJapaneseNewVariant', 'kJapaneseOldVariant'}}
    jp_additions = []
    for name in DICTIONARIES:
        rows = parse_opencc(texts[name], name)
        for row in rows:
            if name == 'JPShinjitaiCharacters.txt':
                row['included'] = frozenset((row['source'], row['target'])) not in japanese
                row['reason'] = 'supplemental-japanese-edge' if row['included'] else 'covered-by-unicode-japanese'
                if row['included']:
                    jp_additions.append(row)
        records.extend(rows)
    for start, end, target in ranges(texts['EquivalentUnifiedIdeograph.txt']):
        for number in range(start, end + 1):
            records.append(relation(chr(number), scalar(target), 'equivalent-radical',
                                    'EquivalentUnifiedIdeograph.txt', 0x2E80 <= number <= 0x2EFF or 0x2F00 <= number <= 0x2FDF))
    decompositions, categories = {}, {}
    for number, line in enumerate(texts['UnicodeData.txt'].splitlines(), 1):
        fields = line.split(';')
        if len(fields) != 15:
            raise ValueError(f'UnicodeData.txt:{number}: expected 15 fields')
        # UnicodeData also lists surrogate ranges; they are not mapping sources.
        cp = int(fields[0], 16)
        if 0xD800 <= cp <= 0xDFFF:
            continue
        char = scalar(fields[0])
        categories[char] = fields[2]
        if fields[5]:
            mapping = re.sub(r'^<[^>]+>\s*', '', fields[5])
            decompositions[char] = ''.join(scalar(v) for v in mapping.split())
    wanted = set(decompositions)
    target_chars = set(''.join(decompositions.values()))
    scripts, blocks = {}, {}
    for name, destination in [('Scripts.txt', scripts), ('Blocks.txt', blocks)]:
        for start, end, value in ranges(texts[name]):
            # Only mapping sources/targets need properties, not all Unicode scalars.
            for char in wanted | target_chars:
                if start <= ord(char) <= end:
                    destination[char] = value
    terminal_cache = {}

    def terminal(char, active=None):
        active = set() if active is None else active
        if char in terminal_cache:
            return terminal_cache[char]
        if char in active:
            raise ValueError('Unicode decomposition cycle')
        if char not in decompositions:
            return char
        active.add(char)
        answer = ''.join(terminal(c, active) for c in decompositions[char])
        active.remove(char)
        terminal_cache[char] = answer
        return answer

    east = {char for char in decompositions
            if (scripts.get(char) in EAST_SCRIPTS or blocks.get(char) in EAST_BLOCKS)
            and not any(scripts.get(c) in {'Latin', 'Greek', 'Cyrillic'} or categories.get(c, '').startswith('N')
                        for c in terminal(char))}
    modes = build_modes(records, decompositions, east)
    for name, mode in modes.items():
        mapping = dict(mode['entries'])
        for a, b in [('土', '士'), ('未', '末'), ('丼', '井')]:
            if mapping.get(a, a) == mapping.get(b, b):
                raise ValueError(f'Forbidden merger {a}/{b} in {name}; inspect original relation paths')
    for a, b in sorted(decompositions.items()):
        row = relation(a, b, 'unicode-decomposition', 'UnicodeData.txt', True)
        row['modes'] = ['eastAsian', 'full'] if a in east else ['full']
        records.append(row)
    records.sort(key=lambda row: (row['file'], row['field'], row['source'], row['target']))
    table = {'schema': 1, 'unicodeVersion': UNICODE, 'openccVersion': '1.4.2', 'openccCommit': OPENCC, 'modes': modes}
    payload = json_bytes(table)
    counts = defaultdict(Counter)
    for row in records:
        counts[row['field']]['input'] += 1
        counts[row['field']]['included' if row['included'] else 'excluded'] += 1
    mode_stats = {}
    for name, mode in modes.items():
        groups = defaultdict(list)
        for a, key in mode['entries']:
            groups[key].append(a)
        mode_stats[name] = {'characters': len(mode['entries']), 'groups': len(groups),
                            'sequenceKeys': sum(len(key) > 1 for key in groups),
                            'largestGroups': sorted(groups.values(), key=lambda g: (-len(g), g))[:20]}
    report = {'schema': 1, 'unicodeVersion': UNICODE, 'openccVersion': '1.4.2', 'sourceFiles': len(lock['files']),
              'fields': dict(counts), 'modes': mode_stats, 'japaneseAdditions': jp_additions,
              'outputBytes': len(payload), 'sha256': hashlib.sha256(payload).hexdigest()}
    audit = ''.join(json.dumps(row, ensure_ascii=False, sort_keys=True) + '\n' for row in records).encode()
    # Publish only after every input, policy and output check has succeeded.
    write_output(output / 'character-data.json', payload)
    write_output(output / 'relations.jsonl', audit)
    write_output(output / 'report.json', json_bytes(report))
    for name in ['Unicode-LICENSE.txt', 'OpenCC-LICENSE.txt', 'OpenCC-NOTICE.txt']:
        if name in texts:
            write_output(ROOT / 'LICENSES' / name, texts[name].encode())
    print(json.dumps({'bytes': len(payload), 'sha256': report['sha256'], 'modes': {k: {s: v for s, v in stat.items() if s != 'largestGroups'} for k, stat in mode_stats.items()}}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--fetch', action='store_true')
    parser.add_argument('--output-dir', type=Path, default=DATA)
    args = parser.parse_args()
    if args.fetch:
        fetch_sources()
    build(args.output_dir)
