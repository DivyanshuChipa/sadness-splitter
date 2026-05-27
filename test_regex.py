import re
import os

workspace_dir = r"c:\Users\H tech\.gemini\antigravity\scratch\sadness-splitter"
main_js_path = os.path.join(workspace_dir, "src", "main.js")

with open(main_js_path, "r", encoding="utf-8") as f:
    main_content = f.read()

dialogues_match = re.search(r"const auraDialogues = \{(.*?)\n\s*\};", main_content, re.DOTALL)
if dialogues_match:
    dialogues_block = dialogues_match.group(1)
    
    # Check hinglish
    start_pattern = r"hinglish:\s*\{"
    start_match = re.search(start_pattern, dialogues_block)
    if start_match:
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
        
        dialog_regex = re.compile(r"(\w+):\s*\{\s*face:\s*['\"](.*?)['\"],\s*msg:\s*['\"](.*?)['\"]\s*\}")
        matches = dialog_regex.findall(dialect_str)
        print("Matches found in hinglish:")
        for key, face, msg in matches:
            if "gold" in key or "yellow" in key:
                print(f"Key: {key}, Face: {face}, Msg: {msg}")
else:
    print("Could not find auraDialogues")
