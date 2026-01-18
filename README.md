# Redmine Blitz ⚡

Lightning-fast keyboard shortcuts for Redmine. Navigate and operate with blazing speed.

## Features

- ⚡ Quick navigation in issue lists
- 🎯 Keyboard control for search results
- 🚀 Fast page navigation
- ⌨️ Vim-inspired key bindings
- 💬 Reply button with keyboard shortcut (auto-assigns to last updater)
- ⌨️ ⌘/Option + Enter to submit forms (compatible with auto-save drafts)
- 🔄 Shift + Enter to toggle Edit/Preview tabs
- 🌐 Multi-language support (Japanese, English, French)

## Installation

```bash
cd /path/to/redmine/plugins
git clone https://github.com/unchained-llc/redmine_blitz.git redmine_blitz
service puma restart
```

Restart your Redmine instance.

## Keyboard Shortcuts

### Navigation

| Key | Action |
|-----|--------|
| `h` | Go to home |
| `m` | Go to my page |
| `n` | Create new issue |
| `i` | Go to issues list |
| `a` | Go to activity |
| `w` | Go to Wiki |
| `/` | Focus search field |
| `p` | Project jump |

### Scrolling

| Key | Action |
|-----|--------|
| `gg` | Scroll to top |
| `G` (Shift+g) | Scroll to bottom |

### Issue Operations

| Key | Action |
|-----|--------|
| `e` | Edit issue (including description) |
| `c` | Copy issue |
| `r` | Reply (issue detail page - auto-assigns to last updater) |
| `Shift + Enter` | Toggle Edit/Preview tabs (when in textarea) |
| `⌘/Option + Enter` | Submit form (works on all forms) |
| `ZZ` | Submit form (Vim-style) |

### Issue List

| Key | Action |
|-----|--------|
| `j` | Move to next row |
| `k` | Move to previous row |
| `x` or `Space` | Toggle issue selection |
| `Enter` | Open issue (bulk edit if 2+ checked) |
| `t` | Open issue in new tab |
| `Esc` | Clear selection (press twice to uncheck all) |

### Search Results

| Key | Action |
|-----|--------|
| `j` | Move to next result |
| `k` | Move to previous result |
| `Enter` | Open selected result |
| `t` | Open result in new tab |

### Other

| Key | Action |
|-----|--------|
| `?` | Show keyboard shortcuts help |
| `Esc` | Blur input field (when focused) |

## Usage Tips

### Efficient Issue List Operations

1. Use `j`/`k` keys to select issues
2. Use `x` or `Space` to check multiple issues
3. Press `Enter` to go to bulk edit

### Two-Stage Selection Clear

- Press `Esc` once to clear highlight only
- Press `Esc` twice to uncheck all checkboxes

### Project Jump

1. Press `p` to open project search
2. Type project name
3. Automatically jumps when narrowed down to one project

### Quick Description Edit

Press `e` to open the issue edit page with the description field already in edit mode.

### Reply to Issue

On issue detail pages, press `r` or click the Reply button to:
- Automatically assign the issue to the last person who updated it (or the author if no updates)
- Open the notes field for quick response
- Supports multiple languages (Japanese, French, English)

### Edit/Preview Toggle

When editing issues or writing notes:
- Press `Shift + Enter` to toggle between Edit and Preview tabs
- Works on issue description, notes, and all textarea fields with wiki formatting
- Quick way to preview your markdown formatting without using the mouse
- Only active when focused on a text input field

## Developer API

The following JavaScript API is available:

```javascript
// Open help overlay
window.KeyboardHelp.open();

// Close help overlay
window.KeyboardHelp.close();

// Toggle help overlay
window.KeyboardHelp.toggle();
```

## Multi-language Support

Redmine Blitz automatically detects your browser language and displays UI elements accordingly:

- **Help overlay (`?` key)**: Displays keyboard shortcuts in your language
- **Reply button**: Shows as "返信" (Japanese), "Reply" (English), or "Répondre" (French)
- Supported languages: Japanese (ja), English (en), French (fr)
- Falls back to English for unsupported languages

## Notes

- Shortcuts are disabled when input fields (input, textarea, etc.) are focused (except Shift+Enter for preview toggle)
- Some shortcuts only work within a project context (`n`, `w`, etc.)
- ⌘-Enter and Shift+Enter work with the auto-save drafts plugin

## License

MIT License

## Author

UNCHAINED
- GitHub: https://github.com/unchained-llc

## Version

1.0.0

#### 1.0.0
- Initial release with core keyboard shortcuts
