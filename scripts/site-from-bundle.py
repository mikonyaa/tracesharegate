import json,pathlib,hashlib,zipfile
root=pathlib.Path('.work/downloaded-release')
manifest=json.loads((root/'release-manifest.json').read_text())
asset=next(a for a in manifest['assets'] if a['name'].startswith('tracesharegate-example-'))
body=(root/asset['name']).read_bytes()
assert hashlib.sha256(body).hexdigest()==asset['sha256']
assert len(body)==asset['bytes']
site=pathlib.Path('site');site.mkdir(exist_ok=False)
with zipfile.ZipFile(root/asset['name']) as z:
    assert set(z.namelist())=={'report.json','report.html','manifest.json','README.txt'}
    for name in ['report.json','report.html','manifest.json']:
        data=z.read(name)
        assert b'TSG_SYNTHETIC_CANARY' not in data
        (site/name).write_bytes(data)
(site/'index.html').write_text('<!doctype html><html lang="en"><meta charset="utf-8"><meta http-equiv="refresh" content="0;url=report.html"><title>TraceShareGate synthetic demo</title><p><a href="report.html">Open synthetic reduced report</a></p></html>\n')
(site/'.nojekyll').write_text('')
