# Third-party data notices

This test plugin embeds derived data, not the OpenCC conversion runtime.

## Unicode 18.0.0

Copyright © 1991–2026 Unicode, Inc. Distributed under [Unicode License V3](LICENSES/Unicode-LICENSE.txt).

Official sources: https://www.unicode.org/Public/18.0.0/ucd/ . Input files and SHA-256 digests are recorded in `data/sources.lock.json`.

## Open Chinese Convert (OpenCC) 1.4.2

Official project: https://github.com/BYVoid/OpenCC . Pinned commit: `025f371dc76b598d77384fbdab90c937471844d8`.

STCharacters.txt, TSCharacters.txt, TWVariants.txt, HKVariants.txt and JPShinjitaiCharacters.txt are Open Chinese Convert (OpenCC) Dictionary files, licensed under [Apache License 2.0](LICENSES/OpenCC-LICENSE.txt). Original file headers are retained in `data/upstream/`. The pinned repository root has no NOTICE file, as recorded in the source lock.

## Modifications

CJK Search generates new search data from these sources: it filters relationship types, retains all eligible character candidates, makes selected relationships symmetric, groups them, recursively resolves selected decomposition sequences, and produces separate East Asian and full compatibility modes. It does not ship regional phrase conversion dictionaries. Generated tables and bundled copies are modified/derived data, not unmodified upstream dictionaries. `data/relations.jsonl` and `data/report.json` preserve source attribution and selection details.

These notices and both license files must accompany the plugin's generated data and bundled `main.js`.
