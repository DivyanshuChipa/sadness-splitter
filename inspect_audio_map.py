import os
import re

workspace_dir = r"c:\Users\H tech\.gemini\antigravity\scratch\sadness-splitter"
main_js_path = os.path.join(workspace_dir, "src", "main.js")
voice_dir = os.path.join(workspace_dir, "src", "emotive-ani-voice")

with open(main_js_path, "r", encoding="utf-8") as f:
    main_content = f.read()

dialogues_match = re.search(r"const auraDialogues = \{(.*?)\n\s*\};", main_content, re.DOTALL)
dialogues_block = dialogues_match.group(1)
dialects = ["hinglish", "english", "sarcastic", "hacker", "lazy"]
dialect_data = {}

for dialect in dialects:
    start_pattern = rf"{dialect}:\s*\{{"
    start_match = re.search(start_pattern, dialogues_block)
    start_idx = start_match.end()
    brace_count = 1
    end_idx = start_idx
    while brace_count > 0 and end_idx < len(dialogues_block):
        char = dialogues_block[end_idx]
        if char == '{':
            brace_count += 1
        elif char == '}':
            brace_count -= 1
        end_idx += 1
    dialect_str = dialogues_block[start_idx:end_idx-1]
    dialect_data[dialect] = dialect_str

folder_map = {
    'sleepy_egg': 'sleepy-egg',
    'settings_saved': 'setting_saved',
    'success_compress': 'sucess_compress',
    'success_split': 'sucess_split',
    'success_trim': 'sucess_trim',
    'success_rotate': 'sucesss_rotate',
    'success_audio': 'sucess_audio',
    'success_gif': 'sucess_gif',
    'theme_synth': 'retro_synth',
    'theme_yellow': 'theme_gold'
}

dialog_regex = re.compile(r"(\w+):\s*\{\s*face:\s*['\"](.*?)['\"],\s*msg:\s*['\"](.*?)['\"]\s*\}")
final_audio_map = {d: {} for d in dialects}

for dialect, dialect_content in dialect_data.items():
    matches = dialog_regex.findall(dialect_content)
    for key, face, msg in matches:
        folder_name = folder_map.get(key, key)
        target_folder = os.path.join(voice_dir, folder_name)
        if not os.path.isdir(target_folder):
            continue
        
        normalized_msg = "".join(c.lower() for c in msg if c.isalnum())
        files = [f for f in os.listdir(target_folder) if f.endswith(".opus")]
        matched_file = None
        for file in files:
            filename_without_ext = os.path.splitext(file)[0]
            if normalized_msg == "".join(c.lower() for c in filename_without_ext if c.isalnum()):
                matched_file = file
                break
        if not matched_file:
            for file in files:
                filename_without_ext = os.path.splitext(file)[0]
                norm_fn = "".join(c.lower() for c in filename_without_ext if c.isalnum())
                if normalized_msg in norm_fn or norm_fn in normalized_msg:
                    matched_file = file
                    break
        if not matched_file and files:
            matched_file = files[0]
            
        if matched_file:
            final_audio_map[dialect][key] = f"{folder_name}/{matched_file}"

print("Keys mapped in hinglish:")
for key in sorted(final_audio_map['hinglish'].keys()):
    print(f" - {key}")
