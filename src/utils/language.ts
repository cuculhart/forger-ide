const LANGUAGE_MAP: Record<string, string> = {
  'ts': 'typescript',
  'tsx': 'typescript',
  'js': 'javascript',
  'jsx': 'javascript',
  'py': 'python',
  'rs': 'rust',
  'go': 'go',
  'java': 'java',
  'cpp': 'cpp',
  'c': 'c',
  'h': 'c',
  'cs': 'csharp',
  'php': 'php',
  'rb': 'ruby',
  'swift': 'swift',
  'kt': 'kotlin',
  'scala': 'scala',
  'html': 'html',
  'css': 'css',
  'scss': 'scss',
  'json': 'json',
  'xml': 'xml',
  'yaml': 'yaml',
  'yml': 'yaml',
  'md': 'markdown',
  'sql': 'sql',
  'sh': 'shell',
  'bash': 'shell',
  'zsh': 'shell',
  'fish': 'shell',
  'ps1': 'powershell',
  'dockerfile': 'dockerfile',
}

export function getLanguage(filename: string | null): string {
  if (!filename) return 'plaintext'
  const ext = filename.split('.').pop()?.toLowerCase()
  return LANGUAGE_MAP[ext || ''] || 'plaintext'
}
