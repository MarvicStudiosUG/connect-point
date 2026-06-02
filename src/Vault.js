import React, { useState, useEffect } from 'react';
import { useUser } from './UserContext.js';
import { getVaultNotes, createVaultNote, updateVaultNote, deleteVaultNote } from './db.js';

export default function Vault() {
  const currentUser = useUser();
  const [notes, setNotes] = useState([]);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [editId, setEditId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const loadNotes = async () => {
    if (!currentUser?.uid) return;
    const data = await getVaultNotes(currentUser.uid);
    setNotes(data);
  };

  useEffect(() => { loadNotes(); }, [currentUser]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setLoading(true);
    if (editId) {
      await updateVaultNote(currentUser.uid, editId, { title, content });
    } else {
      await createVaultNote(currentUser.uid, title, content);
    }
    setTitle('');
    setContent('');
    setEditId(null);
    setShowForm(false);
    await loadNotes();
    setLoading(false);
  };

  const handleEdit = (note) => {
    setTitle(note.title);
    setContent(note.content);
    setEditId(note.id);
    setShowForm(true);
  };

  const handleDelete = async (noteId) => {
    if (confirm('Delete this note?')) {
      await deleteVaultNote(currentUser.uid, noteId);
      await loadNotes();
    }
  };

  const cancelForm = () => {
    setTitle('');
    setContent('');
    setEditId(null);
    setShowForm(false);
  };

  if (!currentUser) return null;

  return React.createElement('div', { className: 'vault-container' },
    React.createElement('div', { className: 'vault-header' },
      React.createElement('h2', null, 'Vault'),
      !showForm && React.createElement('button', { className: 'btn btn-primary', onClick: () => setShowForm(true) },
        React.createElement('i', { className: 'ph ph-plus' }), ' New Note')
    ),
    showForm && React.createElement('form', { onSubmit: handleSubmit, className: 'glass', style: { padding: '1rem', marginBottom: '16px' } },
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Title'),
        React.createElement('input', { className: 'input-field', type: 'text', value: title, onChange: (e) => setTitle(e.target.value), placeholder: 'Note title', required: true })
      ),
      React.createElement('div', { className: 'input-group' },
        React.createElement('label', null, 'Content'),
        React.createElement('textarea', { className: 'input-field', rows: 4, value: content, onChange: (e) => setContent(e.target.value), placeholder: 'Write your secret...', required: true })
      ),
      React.createElement('div', { style: { display: 'flex', gap: '8px' } },
        React.createElement('button', { type: 'submit', className: 'btn btn-primary', disabled: loading }, editId ? 'Update' : 'Save'),
        React.createElement('button', { type: 'button', className: 'btn', onClick: cancelForm }, 'Cancel')
      )
    ),
    React.createElement('div', { className: 'rooms-grid' },
      notes.map(note =>
        React.createElement('div', { key: note.id, className: 'room-card glass', style: { position: 'relative' } },
          React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } },
            React.createElement('h3', null, note.title),
            React.createElement('div', { style: { display: 'flex', gap: '4px' } },
              React.createElement('button', { className: 'btn-icon', onClick: () => handleEdit(note), title: 'Edit' },
                React.createElement('i', { className: 'ph ph-pencil-simple' })),
              React.createElement('button', { className: 'btn-icon', onClick: () => handleDelete(note.id), title: 'Delete' },
                React.createElement('i', { className: 'ph ph-trash', style: { color: 'var(--danger)' } }))
            )
          ),
          React.createElement('pre', { style: { whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: 'var(--surface)', padding: '12px', borderRadius: '12px', marginTop: '8px' } }, note.content),
          React.createElement('div', { style: { fontSize: '0.7rem', color: 'var(--text-secondary)', marginTop: '8px' } }, note.updatedAt?.toDate?.()?.toLocaleString() || note.createdAt?.toDate?.()?.toLocaleString())
        )
      )
    )
  );
                          }
