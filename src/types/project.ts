export interface ProjectFile {
  path: string
  name: string
  isDirectory: boolean
  content?: string
  language?: string
}

export interface Project {
  rootPath: string
  name: string
  files: ProjectFile[]
  isOpen: boolean
}

export interface ProjectContext {
  project: Project | null
  selectedFiles: string[]
  openFiles: Map<string, string> // path -> content
}
