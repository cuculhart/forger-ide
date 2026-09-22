import React from 'react'
import { useT } from '../services/i18nService'
import './FileEditApproval.css'
import './CommandApproval.css'

interface CommandApprovalProps {
  commands: string[]
  onApprove: (commands: string[]) => void
  onReject: () => void
  onRejectOne: (command: string) => void
}

const CommandApproval: React.FC<CommandApprovalProps> = ({ commands, onApprove, onReject, onRejectOne }) => {
  const t = useT()
  return (
    <div className="file-edit-approval">
      <div className="approval-content">
        <div className="approval-header">
          <h3>{t('Command Approval')}</h3>
          <p className="edit-count">
            {commands.length} {t('command(s) to run in the project root')}
          </p>
        </div>

        <div className="edits-list">
          {commands.map((command) => (
            <div key={command} className="edit-item">
              <div className="edit-header">
                <span className="file-path command-text">{command}</span>
                <div className="edit-actions">
                  <button
                    className="reject-one-button"
                    onClick={() => onRejectOne(command)}
                    title={t('Reject this command')}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <p className="command-warning">
          {t('Commands run in a shell with your user permissions. Review them before approving.')}
        </p>

        <div className="approval-actions">
          <button className="reject-all-button" onClick={onReject}>
            {t('Reject All')}
          </button>
          <button className="approve-button" onClick={() => onApprove(commands)}>
            {t('Run')} {commands.length} {t('Command(s)')}
          </button>
        </div>
      </div>
    </div>
  )
}

export default CommandApproval
