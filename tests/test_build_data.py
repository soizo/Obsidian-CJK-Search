import hashlib
import shutil
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from scripts import build_data
from scripts.build_data import build_modes, parse_opencc, parse_unihan, ranges, verify_file


class DataTests(unittest.TestCase):
    def test_unihan_preserves_type_and_strips_annotations(self):
        rows = parse_unihan(
            'U+767C\tkSimplifiedVariant\tU+53D1\n'
            'U+771E\tkSemanticVariant\tU+771F<kLau,kMatthews\n',
            'Unihan_Variants.txt')
        self.assertEqual(rows[0]['target'], '发')
        self.assertTrue(rows[0]['included'])
        self.assertEqual(rows[1]['target'], '真')
        self.assertFalse(rows[1]['included'])
        self.assertEqual(rows[1]['file'], 'Unihan_Variants.txt')

    def test_opencc_all_candidates_and_supplementary_characters(self):
        rows = parse_opencc('# comment\n发\t發 髮\n𠀀\t一\n', 'STCharacters.txt')
        self.assertEqual([r['target'] for r in rows], ['發', '髮', '一'])
        self.assertTrue(all(r['included'] for r in rows))

    def test_rejects_bad_and_phrase_records(self):
        for text in ['鼠标\t滑鼠\n', '体\t體x\n', '体\n', '体\t\n']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_opencc(text, 'STCharacters.txt')
        for text in ['U+110000\tkZVariant\tU+4E00', 'U+D800\tkZVariant\tU+4E00',
                     'U+4E00\tkZVariant\tnonsense']:
            with self.subTest(text=text), self.assertRaises(ValueError):
                parse_unihan(text, 'Unihan_Variants.txt')

    def test_modes_and_mixed_sequences(self):
        rows = parse_opencc('体\t體\n会\t會\n', 'STCharacters.txt')
        modes = build_modes(rows, {'①': '1', '㍿': '株式會社', '､': '、'}, {'㍿', '､'})
        east = dict(modes['eastAsian']['entries'])
        full = dict(modes['full']['entries'])
        self.assertEqual(east['体'], east['體'])
        self.assertNotIn('①', east)
        self.assertEqual(full['①'], '1')
        self.assertEqual(east['㍿'], '株式会社')
        self.assertEqual(east['､'], east['、'])

    def test_excluded_edges_do_not_bridge_groups(self):
        rows = parse_unihan('U+571F\tkSpoofingVariant\tU+58EB\n', 'Unihan_Variants.txt')
        modes = build_modes(rows, {}, set())
        self.assertEqual(modes['eastAsian']['entries'], [])

    def test_recursive_sequences_and_determinism(self):
        decompositions = {'ﬃ': 'ffi', '㍿': '株式會社', 'Ａ': 'A', '⒜': '(a)'}
        rows = parse_opencc('会\t會\n', 'STCharacters.txt')
        a = build_modes(rows, decompositions, {'㍿'})
        b = build_modes(list(reversed(rows)), dict(reversed(list(decompositions.items()))), {'㍿'})
        self.assertEqual(a, b)
        self.assertEqual(dict(a['full']['entries'])['ﬃ'], 'ffi')

    def test_cycles_and_conflicting_sequences_fail(self):
        with self.assertRaises(ValueError):
            build_modes([], {'㍿': '㍿a'}, {'㍿'})
        rows = parse_opencc('㍿\t㌀\n', 'STCharacters.txt')
        with self.assertRaises(ValueError):
            build_modes(rows, {'㍿': 'ab', '㌀': 'cd'}, {'㍿', '㌀'})

    def test_property_ranges_allow_surrogate_blocks_not_mapping_scalars(self):
        self.assertEqual(ranges('D800..DB7F; High Surrogates\n'), [(0xD800, 0xDB7F, 'High Surrogates')])
        with self.assertRaises(ValueError):
            ranges('110000; Outside Unicode\n')
        with self.assertRaises(ValueError):
            ranges('4E01..4E00; Backwards\n')

    def test_real_build_is_deterministic_and_bad_input_preserves_output(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            first, second = root / 'a', root / 'b'
            build_data.build(first)
            build_data.build(second)
            for name in ['character-data.json', 'relations.jsonl', 'report.json']:
                self.assertEqual((first / name).read_bytes(), (second / name).read_bytes())
            source = root / 'broken-source'
            shutil.copytree(build_data.DATA / 'upstream', source / 'upstream')
            shutil.copy2(build_data.DATA / 'sources.lock.json', source / 'sources.lock.json')
            (source / 'upstream/Unihan.zip').write_bytes(b'corrupted')
            before = (first / 'character-data.json').read_bytes()
            with patch.object(build_data, 'DATA', source), self.assertRaisesRegex(ValueError, 'checksum'):
                build_data.build(first)
            self.assertEqual((first / 'character-data.json').read_bytes(), before)

    def test_checksum_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            file = Path(directory) / 'input.txt'
            file.write_bytes(b'original')
            digest = hashlib.sha256(b'original').hexdigest()
            self.assertEqual(verify_file(file, digest), b'original')
            file.write_bytes(b'modified')
            with self.assertRaises(ValueError):
                verify_file(file, digest)


if __name__ == '__main__':
    unittest.main()
