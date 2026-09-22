interface FileChunk {
  filePath: string
  content: string
  startLine?: number
  endLine?: number
  tokens: number
}

interface ContextWindow {
  chunks: FileChunk[]
  totalTokens: number
  maxTokens: number
}

class ContextService {
  private maxTokens = 100000 // 100k tokens for Gemini 3.8 Flash
  private contextWindow: ContextWindow = {
    chunks: [],
    totalTokens: 0,
    maxTokens: this.maxTokens
  }

  // Simple token estimation (approximately 4 characters per token)
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4)
  }

  // Get important files based on project structure
  private getImportantFiles(files: string[]): string[] {
    const importantPatterns = [
      'package.json',
      'tsconfig.json',
      'README.md',
      'readme.md',
      '.gitignore',
      'vite.config.ts',
      'vite.config.js',
      'webpack.config.js',
      'webpack.config.ts',
      'index.ts',
      'index.js',
      'index.tsx',
      'index.jsx',
      'main.ts',
      'main.js',
      'app.ts',
      'app.js',
      'app.tsx',
      'app.jsx',
      'api/',
      'src/',
      'lib/',
      'components/',
      'services/',
      'utils/',
      'types/',
    ]

    const scoredFiles = files.map(file => {
      let score = 0
      const lowerFile = file.toLowerCase()

      // Exclude binary files
      if (file.match(/\.(pdf|exe|dll|so|dylib|bin|png|jpg|jpeg|gif|ico|woff|woff2|eot|ttf|otf)$/i)) {
        return { file, score: -1000 }
      }

      for (const pattern of importantPatterns) {
        if (lowerFile.includes(pattern.toLowerCase())) {
          score += 10
        }
      }

      // Prefer TypeScript/JavaScript files
      if (file.match(/\.(ts|tsx|js|jsx)$/)) {
        score += 5
      }

      // Prefer text-based files
      if (file.match(/\.(json|md|txt|yml|yaml|xml|html|css|scss|less)$/)) {
        score += 3
      }

      // Prefer shorter paths (less nested)
      score -= file.split('/').length

      return { file, score }
    })

    // Sort by score and return top files
    scoredFiles.sort((a, b) => b.score - a.score)
    return scoredFiles.filter(f => f.score >= 0).map(f => f.file)
  }

  // Chunk long files into smaller pieces
  private chunkFile(content: string, filePath: string): FileChunk[] {
    const lines = content.split('\n')
    const chunks: FileChunk[] = []
    const maxChunkTokens = 2000 // 2k tokens per chunk
    let currentChunk: string[] = []
    let currentTokens = 0
    let startLine = 0

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const lineTokens = this.estimateTokens(line)

      if (currentTokens + lineTokens > maxChunkTokens && currentChunk.length > 0) {
        chunks.push({
          filePath,
          content: currentChunk.join('\n'),
          startLine,
          endLine: i - 1,
          tokens: currentTokens
        })
        currentChunk = []
        currentTokens = 0
        startLine = i
      }

      currentChunk.push(line)
      currentTokens += lineTokens
    }

    // Add remaining content
    if (currentChunk.length > 0) {
      chunks.push({
        filePath,
        content: currentChunk.join('\n'),
        startLine,
        endLine: lines.length - 1,
        tokens: currentTokens
      })
    }

    return chunks
  }

  // Add file to context window
  async addFile(filePath: string, content: string): Promise<void> {
    const tokens = this.estimateTokens(content)

    // If file is too large, chunk it
    if (tokens > 2000) {
      const chunks = this.chunkFile(content, filePath)
      for (const chunk of chunks) {
        if (this.contextWindow.totalTokens + chunk.tokens <= this.maxTokens) {
          this.contextWindow.chunks.push(chunk)
          this.contextWindow.totalTokens += chunk.tokens
        }
      }
    } else {
      if (this.contextWindow.totalTokens + tokens <= this.maxTokens) {
        this.contextWindow.chunks.push({
          filePath,
          content,
          tokens
        })
        this.contextWindow.totalTokens += tokens
      }
    }
  }

  // Build context from project files
  async buildProjectContext(files: string[], readFile: (path: string) => Promise<string>): Promise<string> {
    this.clearContext()

    const importantFiles = this.getImportantFiles(files)
    let context = `Project Context (${importantFiles.length} files)\n`
    context += `Total tokens: ${this.contextWindow.totalTokens}/${this.maxTokens}\n\n`

    for (const filePath of importantFiles) {
      try {
        const content = await readFile(filePath)
        await this.addFile(filePath, content)
        context += `--- ${filePath} ---\n`
        context += `Tokens: ${this.estimateTokens(content)}\n\n`
      } catch (error) {
        console.warn(`Failed to read ${filePath}:`, error)
      }

      // Stop if we've reached token limit
      if (this.contextWindow.totalTokens >= this.maxTokens * 0.9) {
        context += `\n[Context limit reached. ${importantFiles.length - this.contextWindow.chunks.length} files omitted.]\n`
        break
      }
    }

    // Build full context with file contents
    let fullContext = context
    for (const chunk of this.contextWindow.chunks) {
      fullContext += `\n--- ${chunk.filePath}`
      if (chunk.startLine !== undefined) {
        fullContext += ` (lines ${chunk.startLine + 1}-${chunk.endLine! + 1})`
      }
      fullContext += ` ---\n${chunk.content}\n`
    }

    return fullContext
  }

  // Get current context as string
  getContextString(): string {
    let context = `Project Context (${this.contextWindow.chunks.length} chunks)\n`
    context += `Total tokens: ${this.contextWindow.totalTokens}/${this.maxTokens}\n\n`

    for (const chunk of this.contextWindow.chunks) {
      context += `\n--- ${chunk.filePath}`
      if (chunk.startLine !== undefined) {
        context += ` (lines ${chunk.startLine + 1}-${chunk.endLine! + 1})`
      }
      context += ` ---\n${chunk.content}\n`
    }

    return context
  }

  // Clear context
  clearContext(): void {
    this.contextWindow = {
      chunks: [],
      totalTokens: 0,
      maxTokens: this.maxTokens
    }
  }

  // Get context stats
  getContextStats() {
    return {
      totalChunks: this.contextWindow.chunks.length,
      totalTokens: this.contextWindow.totalTokens,
      maxTokens: this.maxTokens,
      files: [...new Set(this.contextWindow.chunks.map(c => c.filePath))]
    }
  }
}

export const contextService = new ContextService()
