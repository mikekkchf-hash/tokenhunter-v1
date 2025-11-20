# verify_prompt.md

Prompt for DebugAgent to validate claims:

Return: JSON { ok: boolean, errors: [{path, message}], suggestions: [{field, new_value, reason}] }
Check numeric consistency and reference existence (URLs).
