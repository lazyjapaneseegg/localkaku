# localkaku
local version of henkaku, automated because I'm a lazy egg.

How to use
==========
- `npm install`
- `node index`

If you want to update to latest version of henkaku run:
`node index --reinstall`

Info
====
You need node 6, babel-node should also work with lower versions.

If for some reason future version of henkaku change the way its patched, you add `--use-python-build`
to your command to run the embedded `build.sh` file, if you do, you need python3 installed.

Install a specific version
==========================
you can see which version are available with `node index --list-release`
if you want for example install the version:
```
Version v1.1 (2016-08-10):
* **Dynarec support**: ...
```
you need to run `node index --tag v1.1` or, if reinstalling, `node index --reinstall --tag v1.1`
