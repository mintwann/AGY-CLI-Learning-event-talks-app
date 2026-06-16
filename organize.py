import os
import shutil

# Define target directories
IMAGES_DIR = "Images"
DOCUMENTS_DIR = "Documents"
VIDEOS_DIR = "Videos"

# Extensions mapping
IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.gif')
DOCUMENT_EXTENSIONS = ('.txt',)
VIDEO_EXTENSIONS = ('.mp4',)

def organize_files():
    # Ensure folders exist
    os.makedirs(IMAGES_DIR, exist_ok=True)
    os.makedirs(DOCUMENTS_DIR, exist_ok=True)
    os.makedirs(VIDEOS_DIR, exist_ok=True)

    moved_count = {
        "Images": 0,
        "Documents": 0,
        "Videos": 0
    }

    # List files in the current directory (non-recursive to avoid .venv/static)
    files = [f for f in os.listdir('.') if os.path.isfile(f)]

    for filename in files:
        # Avoid moving project files
        if filename in ('requirements.txt', '.gitignore'):
            continue

        file_lower = filename.lower()
        target_dir = None

        if file_lower.endswith(IMAGE_EXTENSIONS):
            target_dir = IMAGES_DIR
        elif file_lower.endswith(DOCUMENT_EXTENSIONS):
            target_dir = DOCUMENTS_DIR
        elif file_lower.endswith(VIDEO_EXTENSIONS):
            target_dir = VIDEOS_DIR

        if target_dir:
            source_path = filename
            destination_path = os.path.join(target_dir, filename)
            try:
                shutil.move(source_path, destination_path)
                print(f"Moved: {filename} -> {target_dir}/")
                moved_count[target_dir] += 1
            except Exception as e:
                print(f"Error moving {filename} to {target_dir}: {e}")

    # Print summary
    print("\n--- Organization Summary ---")
    print(f"Images moved: {moved_count['Images']}")
    print(f"Documents moved: {moved_count['Documents']}")
    print(f"Videos moved: {moved_count['Videos']}")
    print("----------------------------")

if __name__ == "__main__":
    organize_files()
