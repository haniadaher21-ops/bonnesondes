import gdown, json, os, tempfile
folder="https://drive.google.com/drive/folders/1gIRXeHlolANWpqWSdlrENC2zFORWRCp3"
print("gdown-version",getattr(gdown,"__version__","unknown"))
print("download-folder-func",str(gdown.download_folder))
with tempfile.TemporaryDirectory() as temporary:
    try:
        result=gdown.download_folder(url=folder,output=temporary,quiet=True,use_cookies=False,remaining_ok=True)
        print("DRIVE_FOLDER_TEST",json.dumps({"downloaded":len(result or []),"files":[{"name":os.path.basename(x),"bytes":os.stat(x).st_size} for x in (result or [])][:20]}))
        if not result:
            raise RuntimeError("No images retrieved from public Drive folder")
    except Exception as exc:
        print("DRIVE_FOLDER_ERROR",repr(exc))
        raise
