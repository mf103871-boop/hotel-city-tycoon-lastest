"""Keep the legacy drawing scripts away from versioned production artwork."""
from functools import lru_cache
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
LOCK = ROOT / 'art-source/approved/cartoon-v1/exports.json'


@lru_cache(maxsize=1)
def protected_paths():
    if not LOCK.exists():
        return frozenset()
    data = json.loads(LOCK.read_text())
    return frozenset((ROOT / row['file']).resolve() for row in data['exports'])


def guard_legacy_write(path):
    if Path(path).resolve() in protected_paths():
        raise RuntimeError(f'Protected production art: {path}. Use npm run gen:art:approved; '
                           'the legacy generator must not redraw this asset.')


if __name__ == '__main__' and '--preflight' in sys.argv and protected_paths():
    raise SystemExit('gen:art stopped before writing: production art is protected. '
                     'Use npm run gen:art:approved for the versioned sample. '
                     'Legacy generators may still export other, unprotected IDs.')
