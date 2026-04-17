# Paperclip Editor Plugin

## Goal

Add a compact `Open in...` issue toolbar control that launches the issue workspace in IntelliJ IDEA on the same local machine.

## Requirements

- The plugin must register an issue-scoped toolbar button.
- The toolbar control should behave like a split button: primary launch action plus dropdown menu.
- The control must stay hidden unless the current Paperclip host origin is `localhost` or `127.0.0.1`.
- The control must stay hidden unless the issue resolves to a local project workspace path.
- The worker must resolve the workspace through Paperclip APIs instead of trusting a raw path from the UI.
- The worker must use a curated local command to open IntelliJ IDEA.
- The first release only needs IntelliJ IDEA, but the model should support more editors later.

## Non-Goals

- Remote Paperclip instances
- Arbitrary shell command execution
- Multiple editor implementations in the first pass
