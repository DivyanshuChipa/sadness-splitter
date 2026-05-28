import os
import re
import json
import sys

# Reconfigure stdout to use UTF-8 to prevent Windows terminal character map crashes
if sys.stdout.encoding != 'utf-8':
    try:
        sys.stdout.reconfigure(encoding='utf-8')
    except AttributeError:
        # Fallback for older python versions
        import codecs
        sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

def normalize_text(text):
    if not text:
        return ""
    # Convert to lowercase and keep only alphanumeric characters
    return "".join(c.lower() for c in text if c.isalnum())

def main():
    print("Starting Aura Mascot Voiceovers Mapper...")
    
    workspace_dir = r"c:\Users\H tech\.gemini\antigravity\scratch\sadness-splitter"
    main_js_path = os.path.join(workspace_dir, "src", "main.js")
    voice_dir = os.path.join(workspace_dir, "src", "emotive-ani-voice")
    output_js_path = os.path.join(workspace_dir, "src", "aura_audio_map.js")
    
    # Read main.js
    with open(main_js_path, "r", encoding="utf-8") as f:
        main_content = f.read()
    
    # Extract the auraDialogues block
    # Matches from "const auraDialogues = {" to "};"
    dialogues_match = re.search(r"const auraDialogues = \{(.*?)\n\s*\};", main_content, re.DOTALL)
    if not dialogues_match:
        print("Error: Could not find const auraDialogues in main.js")
        return
    
    dialogues_block = dialogues_match.group(1)
    
    # Extract dialects blocks: hinglish, english, sarcastic, hacker, lazy
    dialects = ["hinglish", "english", "sarcastic", "hacker", "lazy"]
    dialect_data = {}
    
    for i, dialect in enumerate(dialects):
        # Find start index of dialect
        start_pattern = rf"{dialect}:\s*\{{"
        start_match = re.search(start_pattern, dialogues_block)
        if not start_match:
            print(f"Error: Could not find dialect '{dialect}' in auraDialogues")
            continue
            
        start_idx = start_match.end()
        # Find closing brace of this dialect block by counting braces
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
    
    # Event Key folder spelling mappings
    folder_map = {
        'sleepy_egg': 'sleepy-egg',
        'settings_saved': 'setting_saved',
        'success_compress': 'sucess_compress',
        'success_split': 'sucess_split',
        'success_trim': 'sucess_trim',
        'success_rotate': 'sucesss_rotate',
        'success_audio': 'sucess_audio',
        'success_gif': 'sucess_gif',
        'theme_synth': 'retro_synth'
    }
    
    # Standard dialog parsing regex:
    # key: { face: '...', msg: "..." }
    dialog_regex = re.compile(r"(\w+):\s*\{\s*face:\s*['\"](.*?)['\"],\s*msg:\s*['\"](.*?)['\"]\s*\}")
    
    final_audio_map = {d: {} for d in dialects}
    
    # Process each dialect and map it to audio files
    for dialect, dialect_content in dialect_data.items():
        matches = dialog_regex.findall(dialect_content)
        print(f"\nProcessing dialect '{dialect}' ({len(matches)} dialogues parsed)...")
        
        for key, face, msg in matches:
            # Skip silent keys like interact_tab_* since they only react with UI text/face and do not play audio
            if key.startswith("interact_tab_"):
                continue
                
            folder_name = folder_map.get(key, key)
            target_folder = os.path.join(voice_dir, folder_name)
            
            if not os.path.isdir(target_folder):
                print(f"  [Auto-Create] Creating missing directory for key '{key}': {folder_name}")
                os.makedirs(target_folder, exist_ok=True)
                
            normalized_msg = normalize_text(msg)
            
            # Scan files in the target folder
            files = [f for f in os.listdir(target_folder) if f.endswith(".opus")]
            matched_file = None
            
            # 1. Try exact normalized match
            for file in files:
                filename_without_ext = os.path.splitext(file)[0]
                normalized_filename = normalize_text(filename_without_ext)
                
                if normalized_msg == normalized_filename:
                    matched_file = file
                    break
            
            # 2. Try soft containment match if exact match failed
            if not matched_file:
                for file in files:
                    filename_without_ext = os.path.splitext(file)[0]
                    normalized_filename = normalize_text(filename_without_ext)
                    
                    if normalized_msg in normalized_filename or normalized_filename in normalized_msg:
                        matched_file = file
                        break
            
            # 3. Fallback: if we only have 1 file or a very close one, use index or first file
            if not matched_file and files:
                matched_file = files[0]
                print(f"  [Fallback] No match for '{key}' ('{msg[:25]}...'). Defaulting to: {matched_file}")
                
            if matched_file:
                # Store relative path inside emotive-ani-voice
                # Format: folder/filename
                final_audio_map[dialect][key] = f"{folder_name}/{matched_file}"
            else:
                print(f"  [Error] No audio files found in folder {folder_name} for key '{key}'")
                
    # Output the generated map to aura_audio_map.js
    with open(output_js_path, "w", encoding="utf-8") as f:
        f.write("// ==========================================================\n")
        f.write("// --- Generated Aura mascot dynamic audio lookup map -------\n")
        f.write("// --- DO NOT EDIT MANUALLY - Generated via script ---------\n")
        f.write("// ==========================================================\n\n")
        f.write("window.auraAudioMap = ")
        f.write(json.dumps(final_audio_map, indent=2, ensure_ascii=False))
        f.write(";\nconst auraAudioMap = window.auraAudioMap;\n")
        
    # Clean up obsolete directories starting with 'interact_tab_' in voice_dir
    print("\nCleaning up obsolete voice directories...")
    import shutil
    for name in os.listdir(voice_dir):
        if name.startswith("interact_tab_"):
            dir_to_remove = os.path.join(voice_dir, name)
            if os.path.isdir(dir_to_remove):
                try:
                    shutil.rmtree(dir_to_remove)
                    print(f"  [Cleaned] Removed obsolete directory: {name}")
                except Exception as e:
                    print(f"  [Warning] Could not remove {name}: {e}")
        
    print(f"\nSuccess! Generated audio map written to {output_js_path}")

if __name__ == "__main__":
    main()
