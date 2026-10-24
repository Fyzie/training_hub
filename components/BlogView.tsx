'use client';

import React, { useState, useEffect, useRef } from 'react';
import { BlogPost, BlogAttachment, GuidanceCategory, StaffUser } from '@/lib/types';
import { useAuth } from './AuthContext';
import {
  BookOpen,
  Plus,
  UploadCloud,
  FileText,
  FileSpreadsheet,
  Download,
  Search,
  Eye,
  Heart,
  Tag,
  Calendar,
  User,
  Image as ImageIcon,
  CheckCircle2,
  X,
  FileCheck,
  Sparkles,
  Share2,
  Edit3,
  Trash2,
  ArrowLeft,
  AlertCircle,
  FileCode,
  Paperclip,
  Package,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

function getInitials(name?: string) {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getAuthorAvatar(author: BlogPost['author'], currentUser?: StaffUser | null, usersList: StaffUser[] = []): string {
  // If matched with current logged-in user
  if (currentUser && (author.id === currentUser.id || author.name?.trim().toLowerCase() === currentUser.name?.trim().toLowerCase())) {
    return currentUser.avatar || '';
  }
  // If matched with any registered staff member
  const matched = usersList.find((u) => u.id === author.id || u.name?.trim().toLowerCase() === author.name?.trim().toLowerCase());
  if (matched) {
    return matched.avatar || '';
  }
  // Strip any legacy dummy unsplash avatar
  if (author.avatar && author.avatar.includes('images.unsplash.com')) {
    return '';
  }
  return author.avatar || '';
}

function parseInlineMarkdown(text: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = /(!?\[([^\]]*)\]\(([^)]+)\)|\*\*([^*]+)\*\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.substring(lastIndex, match.index));
    }

    const fullMatch = match[0];
    if (fullMatch.startsWith('![')) {
      const alt = match[2];
      const src = match[3];
      parts.push(
        <span key={match.index} className="block my-3 text-center">
          <img
            src={src}
            alt={alt || 'Image'}
            className="rounded-2xl max-w-full max-h-[500px] object-contain border border-slate-200 shadow-md mx-auto"
          />
          {alt && <span className="block text-[11px] text-slate-400 mt-1">{alt}</span>}
        </span>
      );
    } else if (fullMatch.startsWith('[')) {
      const linkText = match[2];
      const href = match[3];
      parts.push(
        <a key={match.index} href={href} target="_blank" rel="noreferrer" className="text-blue-600 font-bold underline hover:text-blue-800">
          {linkText}
        </a>
      );
    } else if (fullMatch.startsWith('**')) {
      parts.push(<strong key={match.index} className="font-bold text-slate-900">{match[4]}</strong>);
    }

    lastIndex = regex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push(text.substring(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

function cleanExcerpt(text: string): string {
  if (!text) return '';
  return text.replace(/!\[([^\]]*)\]\([^)]+\)/g, '').replace(/\s+/g, ' ').trim();
}

function renderMarkdownContent(content: string) {
  if (!content) return null;
  const lines = content.split('\n');
  const elements: React.ReactNode[] = [];
  let inCodeBlock = false;
  let codeBuffer: string[] = [];

  lines.forEach((line, idx) => {
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        elements.push(
          <pre key={`code-${idx}`} className="bg-slate-900 text-slate-100 p-4 rounded-2xl text-xs font-mono overflow-x-auto my-3 border border-slate-800">
            <code>{codeBuffer.join('\n')}</code>
          </pre>
        );
        codeBuffer = [];
        inCodeBlock = false;
      } else {
        inCodeBlock = true;
      }
      return;
    }

    if (inCodeBlock) {
      codeBuffer.push(line);
      return;
    }

    const imgMatch = line.trim().match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (imgMatch) {
      const alt = imgMatch[1];
      const src = imgMatch[2];
      elements.push(
        <div key={`img-${idx}`} className="my-5 flex flex-col items-center">
          <img
            src={src}
            alt={alt || 'Document Image'}
            className="rounded-2xl max-w-full max-h-[500px] object-contain border border-slate-200/90 shadow-md"
          />
          {alt && <span className="text-[11px] text-slate-400 mt-1.5 font-medium">{alt}</span>}
        </div>
      );
      return;
    }

    if (line.startsWith('# ')) {
      elements.push(<h1 key={idx} className="text-2xl font-black text-slate-900 mt-6 mb-2 tracking-tight">{line.slice(2)}</h1>);
      return;
    }
    if (line.startsWith('## ')) {
      elements.push(<h2 key={idx} className="text-xl font-extrabold text-slate-900 mt-5 mb-2">{line.slice(3)}</h2>);
      return;
    }
    if (line.startsWith('### ')) {
      elements.push(<h3 key={idx} className="text-lg font-bold text-slate-900 mt-4 mb-1">{line.slice(4)}</h3>);
      return;
    }

    if (line.trim().startsWith('- ') || line.trim().startsWith('* ')) {
      elements.push(
        <li key={idx} className="text-xs sm:text-sm text-slate-700 ml-5 list-disc leading-relaxed my-0.5">
          {parseInlineMarkdown(line.trim().slice(2))}
        </li>
      );
      return;
    }

    if (!line.trim()) {
      elements.push(<div key={`empty-${idx}`} className="h-3" />);
      return;
    }

    elements.push(
      <p key={idx} className="text-xs sm:text-sm text-slate-700 leading-relaxed my-1">
        {parseInlineMarkdown(line)}
      </p>
    );
  });

  return <div className="space-y-1">{elements}</div>;
}

export function BlogView() {
  const { user, allUsers } = useAuth();
  const [blogs, setBlogs] = useState<BlogPost[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [readingPost, setReadingPost] = useState<BlogPost | null>(null);
  const [editingBlogId, setEditingBlogId] = useState<string | null>(null);

  // Creation Mode: 'upload' (Word/PDF/Slides) vs 'write' (custom rich blog with drag & drop images)
  const [creationMode, setCreationMode] = useState<'upload' | 'write'>('upload');

  // Form State for Custom Writing
  const [postTitle, setPostTitle] = useState('');
  const [postCategory, setPostCategory] = useState<GuidanceCategory>('Guidance');
  const [postTags, setPostTags] = useState('VisionAI, PyTorch, SOP');
  const [postContent, setPostContent] = useState('');
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const contentTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Form State for File Upload (Python scripts, Word, PDF, Slides, Any Resource)
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileTitle, setFileTitle] = useState('');
  const [fileCategory, setFileCategory] = useState<GuidanceCategory>('Guidance');
  const [fileTags, setFileTags] = useState('Guidelines, Document');
  const [fileDescription, setFileDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDraggingDoc, setIsDraggingDoc] = useState(false);
  const [docUploadError, setDocUploadError] = useState<string | null>(null);

  // Additional attachments for both Upload and Custom Blog modes
  const [additionalFiles, setAdditionalFiles] = useState<File[]>([]);
  const [existingAttachments, setExistingAttachments] = useState<BlogAttachment[]>([]);
  const [blogsPage, setBlogsPage] = useState(1);

  const loadBlogs = async () => {
    try {
      const res = await fetch('/api/blogs');
      if (res.ok) {
        const data = await res.json();
        setBlogs(data);
      }
    } catch (err) {
      console.error('Failed to load blogs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadBlogs();
  }, []);

  // Handle Like
  const handleLike = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch('/api/blogs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action: 'like' })
      });
      if (res.ok) {
        setBlogs((prev) =>
          prev.map((b) => (b.id === id ? { ...b, likes: b.likes + 1 } : b))
        );
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Open Reading Full-Page View
  const openPost = (post: BlogPost) => {
    setReadingPost(post);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    // Increment view count in background
    fetch('/api/blogs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: post.id, action: 'view' })
    }).catch(() => {});
  };

  // Image Drag & Drop into Custom Blog Writer
  const handleImageDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingImage(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        await uploadAndInsertImage(file);
      }
    }
  };

  const uploadAndInsertImage = async (file: File) => {
    try {
      const safeName = file.name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
      const formData = new FormData();
      formData.append('file', file, safeName);
      formData.append('type', 'image');

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();

      if (data.success && data.url) {
        const imageMarkdown = `\n![${file.name}](${data.url})\n`;
        setPostContent((prev) => prev + imageMarkdown);
      }
    } catch (err) {
      console.error('Failed to upload image:', err);
    }
  };

  // Handle Drag & Drop of Documents (Word, PDF, Slides, MD)
  const handleDocDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingDoc(false);
    setDocUploadError(null);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const f = e.dataTransfer.files[0];
      setUploadedFile(f);
      if (!fileTitle) {
        setFileTitle(f.name.replace(/\.[^/.]+$/, ''));
      }
    }
  };

  // Submit Uploaded File (Word, PDF, Slides, Markdown)
  const handleFileUploadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uploadedFile) {
      setDocUploadError('Please select or drop a file (.py, .docx, .pdf, .pptx, .md, or other) to publish.');
      return;
    }

    setIsSubmitting(true);
    setDocUploadError(null);
    try {
      const safeName = uploadedFile.name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
      const formData = new FormData();
      formData.append('file', uploadedFile, safeName);
      formData.append('type', 'doc');

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      });

      if (!uploadRes.ok) {
        const errJson = await uploadRes.json().catch(() => ({}));
        throw new Error(errJson.error || `Upload failed with HTTP ${uploadRes.status}`);
      }

      const uploadData = await uploadRes.json();
      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Document upload failed');
      }

      // Keep attachments cleanly formatted as downloadable guidance resources
      let docContent = `### Document Overview\n${fileDescription || 'Uploaded team guidance document and resource file.'}\n\n**File Attached:** [${uploadedFile.name}](${uploadData.url}) (${uploadData.sizeMB} MB)\n\nClick the download button to retrieve the attached resource file.`;

      // Only parse as full article if explicitly a markdown file (.md) and no custom description was provided
      const isMd = /\.(md|markdown)$/i.test(uploadedFile.name);
      if (isMd && !fileDescription.trim()) {
        try {
          const rawText = await uploadedFile.text();
          if (rawText && rawText.trim()) {
            docContent = rawText;
          }
        } catch (textErr) {
          console.warn('Could not read markdown text directly:', textErr);
        }
      }

      // Upload any additional attached files
      const uploadedExtras: BlogAttachment[] = [];
      for (const extra of additionalFiles) {
        try {
          const safeExtra = extra.name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
          const extraFormData = new FormData();
          extraFormData.append('file', extra, safeExtra);
          extraFormData.append('type', 'doc');
          const extraRes = await fetch('/api/upload', { method: 'POST', body: extraFormData });
          if (extraRes.ok) {
            const exData = await extraRes.json();
            if (exData.success) {
              uploadedExtras.push({
                name: extra.name,
                url: exData.url,
                fileType: exData.fileType || (extra.name.toLowerCase().endsWith('.py') ? 'py' : 'other'),
                sizeMB: exData.sizeMB || Math.round((extra.size / (1024 * 1024)) * 100) / 100
              });
            }
          }
        } catch (exErr) {
          console.warn('Failed to upload additional attachment:', extra.name, exErr);
        }
      }

      const titleClean = fileTitle.trim() || uploadedFile.name.replace(/\.[^/.]+$/, '');
      const isPy = uploadedFile.name.toLowerCase().endsWith('.py');
      const primaryAttachment: BlogAttachment = {
        name: uploadedFile.name,
        url: uploadData.url,
        fileType: uploadData.fileType || (isPy ? 'py' : isMd ? 'md' : 'other'),
        sizeMB: uploadData.sizeMB || Math.round((uploadedFile.size / (1024 * 1024)) * 100) / 100
      };
      const allAttachments: BlogAttachment[] = [primaryAttachment, ...uploadedExtras];

      const blogPayload = {
        title: titleClean,
        excerpt: fileDescription.trim() || (isMd ? docContent.slice(0, 150).replace(/[#*`]/g, '') + '...' : `Attachment resource: ${uploadedFile.name}`),
        content: docContent,
        category: fileCategory || 'Guidance',
        tags: fileTags ? fileTags.split(',').map((t) => t.trim()).filter(Boolean) : [fileCategory || 'Guidance'],
        author: {
          id: user?.id || 'usr-1',
          name: user?.name || 'Staff Specialist',
          avatar: user?.avatar || '',
          role: user?.role || 'Staff Engineer'
        },
        attachment: primaryAttachment,
        attachments: allAttachments
      };

      const blogRes = await fetch('/api/blogs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(blogPayload)
      });

      if (!blogRes.ok) {
        const bErr = await blogRes.json().catch(() => ({}));
        throw new Error(bErr.error || `Publishing document failed with HTTP ${blogRes.status}`);
      }

      const createdBlog = await blogRes.json();
      await loadBlogs();
      setShowCreateModal(false);
      setUploadedFile(null);
      setAdditionalFiles([]);
      setExistingAttachments([]);
      setFileTitle('');
      setFileDescription('');
      setFileTags('Guidelines, Document');
      setDocUploadError(null);

      if (createdBlog && createdBlog.id) {
        setReadingPost(createdBlog);
      }
    } catch (err: any) {
      console.error('Error creating document post:', err);
      setDocUploadError(err.message || 'Failed to publish document. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEdit = (post: BlogPost, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingBlogId(post.id);
    setPostTitle(post.title);
    let cat = post.category;
    if (cat === 'Guidance' || cat === 'Guidance Document' || cat === 'Tutorial' || cat === 'Guidance Doc') cat = 'Guidance';
    else if (cat === 'Hardware SOP') cat = 'Hardware Setup';
    else if (cat === 'Model Setup') cat = 'Software Setup';
    else if (!['Guidance', 'Hardware Setup', 'Software Setup', 'SOP'].includes(cat)) cat = 'Guidance';
    setPostCategory(cat);
    setPostTags(post.tags.join(', '));
    setPostContent(post.content);

    const initialAttachments: BlogAttachment[] = [
      ...(post.attachments || []),
      ...(post.attachment && !(post.attachments || []).some((a) => a.url === post.attachment?.url) ? [post.attachment] : [])
    ];
    setExistingAttachments(initialAttachments);
    setAdditionalFiles([]);
    setCreationMode('write');
    setShowCreateModal(true);
  };

  const handleDeleteBlog = async (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!confirm('Are you sure you want to delete this guidance document?')) return;
    try {
      const res = await fetch(`/api/blogs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setBlogs((prev) => prev.filter((b) => b.id !== id));
        if (readingPost?.id === id) setReadingPost(null);
      }
    } catch (err) {
      console.error('Failed to delete blog:', err);
    }
  };

  // Submit Custom Written Blog (or update existing)
  const handleCustomWriteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!postTitle || !postContent) return;

    setIsSubmitting(true);
    try {
      // Upload any new additional attached files
      const uploadedExtras: BlogAttachment[] = [...existingAttachments];
      for (const extra of additionalFiles) {
        try {
          const safeExtra = extra.name.trim().replace(/\s+/g, '_').replace(/[^a-zA-Z0-9._-]/g, '_');
          const extraFormData = new FormData();
          extraFormData.append('file', extra, safeExtra);
          extraFormData.append('type', 'doc');
          const extraRes = await fetch('/api/upload', { method: 'POST', body: extraFormData });
          if (extraRes.ok) {
            const exData = await extraRes.json();
            if (exData.success) {
              uploadedExtras.push({
                name: extra.name,
                url: exData.url,
                fileType: exData.fileType || (extra.name.toLowerCase().endsWith('.py') ? 'py' : 'other'),
                sizeMB: exData.sizeMB || Math.round((extra.size / (1024 * 1024)) * 100) / 100
              });
            }
          }
        } catch (exErr) {
          console.warn('Failed to upload additional attachment:', extra.name, exErr);
        }
      }

      if (editingBlogId) {
        // Update existing blog
        const updatePayload = {
          title: postTitle.trim(),
          category: postCategory,
          tags: postTags.split(',').map((t) => t.trim()).filter(Boolean),
          content: postContent,
          excerpt: postContent.slice(0, 160).replace(/[#*`\n]/g, ' ') + '...',
          attachment: uploadedExtras[0] || null,
          attachments: uploadedExtras
        };

        const res = await fetch(`/api/blogs/${editingBlogId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        });

        if (res.ok) {
          const updated = await res.json();
          setBlogs((prev) => prev.map((b) => (b.id === editingBlogId ? updated : b)));
          if (readingPost?.id === editingBlogId) setReadingPost(updated);
          setShowCreateModal(false);
          setEditingBlogId(null);
          setPostTitle('');
          setPostContent('');
          setAdditionalFiles([]);
          setExistingAttachments([]);
        }
      } else {
        // Create new blog
        const blogPayload = {
          title: postTitle.trim(),
          excerpt: postContent.slice(0, 160).replace(/[#*`\n]/g, ' ') + '...',
          content: postContent,
          category: postCategory,
          tags: postTags.split(',').map((t) => t.trim()).filter(Boolean),
          author: {
            id: user?.id || 'usr-1',
            name: user?.name || 'Staff Specialist',
            avatar: user?.avatar || '',
            role: user?.role || 'Engineer'
          },
          attachment: uploadedExtras[0] || undefined,
          attachments: uploadedExtras
        };

        const blogRes = await fetch('/api/blogs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(blogPayload)
        });

        if (blogRes.ok) {
          const createdBlog = await blogRes.json();
          await loadBlogs();
          setShowCreateModal(false);
          setPostTitle('');
          setPostContent('');
          setAdditionalFiles([]);
          setExistingAttachments([]);
          if (createdBlog && createdBlog.id) {
            setReadingPost(createdBlog);
          }
        }
      }
    } catch (err) {
      console.error('Error publishing blog:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtering
  const filteredBlogs = blogs.filter((b) => {
    const matchCat =
      selectedCategory === 'all' ||
      (() => {
        if (b.category === selectedCategory) return true;
        // Backward-compatible category matching
        if (selectedCategory === 'Guidance' || selectedCategory === 'Guidance Doc') {
          return ['Guidance', 'Guidance Document', 'Tutorial', 'Guidance Doc'].includes(b.category);
        }
        if (selectedCategory === 'Hardware Setup') {
          return ['Hardware SOP', 'Hardware Setup'].includes(b.category);
        }
        if (selectedCategory === 'Software Setup') {
          return ['Model Setup', 'Software Setup'].includes(b.category);
        }
        if (selectedCategory === 'SOP') {
          return ['SOP', 'Hardware SOP', 'Dataset Spec'].includes(b.category);
        }
        return false;
      })();

    const matchSearch =
      searchQuery === '' ||
      b.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.excerpt.toLowerCase().includes(searchQuery.toLowerCase()) ||
      b.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchCat && matchSearch;
  });

  useEffect(() => {
    setBlogsPage(1);
  }, [selectedCategory, searchQuery]);

  const blogsTotalPages = Math.ceil(filteredBlogs.length / 10) || 1;
  const pagedBlogs = filteredBlogs.slice((blogsPage - 1) * 10, blogsPage * 10);

  const renderAttachmentPicker = (inputId: string) => (
    <div className="pt-2 border-t border-slate-100 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Paperclip className="w-3.5 h-3.5 text-blue-600" />
            <span>Additional Attachments</span>
            <span className="text-[10px] text-slate-400 font-normal">(Optional, accepts any file)</span>
          </label>
          <p className="text-[11px] text-slate-400">
            Attach Python scripts (.py), configs, datasets (.zip), or any files for download
          </p>
        </div>
        <label
          htmlFor={inputId}
          className="px-3 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer flex items-center gap-1 transition-all border border-slate-200 shrink-0"
        >
          <Plus className="w-3.5 h-3.5 text-blue-600" />
          <span>Attach File</span>
        </label>
        <input
          id={inputId}
          type="file"
          multiple
          accept="*"
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              const files = Array.from(e.target.files);
              setAdditionalFiles((prev) => [...prev, ...files]);
              e.target.value = '';
            }
          }}
        />
      </div>

      {/* Existing Attachments (if editing) */}
      {existingAttachments.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Current Attachments</p>
          {existingAttachments.map((att, idx) => (
            <div
              key={`exist-att-${idx}`}
              className="flex items-center justify-between p-2 rounded-xl bg-slate-50 border border-slate-200 text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                {att.name.toLowerCase().endsWith('.py') ? (
                  <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Paperclip className="w-4 h-4 text-slate-500 shrink-0" />
                )}
                <span className="font-bold text-slate-800 truncate">{att.name}</span>
                <span className="text-[10px] text-slate-400">({att.sizeMB} MB)</span>
              </div>
              <button
                type="button"
                onClick={() => setExistingAttachments((prev) => prev.filter((_, i) => i !== idx))}
                className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                title="Remove attachment"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Newly Added Additional Files */}
      {additionalFiles.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider">
            Files to Upload ({additionalFiles.length})
          </p>
          {additionalFiles.map((f, idx) => (
            <div
              key={`new-att-${idx}`}
              className="flex items-center justify-between p-2 rounded-xl bg-blue-50/60 border border-blue-200 text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                {f.name.toLowerCase().endsWith('.py') ? (
                  <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                ) : (
                  <Paperclip className="w-4 h-4 text-blue-500 shrink-0" />
                )}
                <span className="font-bold text-blue-950 truncate">{f.name}</span>
                <span className="text-[10px] text-blue-600">
                  ({(f.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAdditionalFiles((prev) => prev.filter((_, i) => i !== idx))}
                className="p-1 hover:bg-rose-100 text-slate-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                title="Remove"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        existingAttachments.length === 0 && (
          <div className="p-2.5 rounded-xl border border-dashed border-slate-200 text-center text-slate-400 text-[11px] bg-slate-50/40">
            No additional attachments selected. Click <strong>"Attach File"</strong> to include supplementary code, configs, or files.
          </div>
        )
      )}
    </div>
  );

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Guidance Docs & Knowledge Base
          </h1>
        </div>

        {!readingPost && (
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 transition-all w-full sm:w-auto cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Guidance Doc</span>
          </button>
        )}
      </div>

      {/* CONDITIONAL: EITHER FULL-PAGE DOCUMENT VIEW OR DOC LIST */}
      {readingPost ? (
        /* WHOLE-PAGE GUIDANCE DOCUMENT VIEW (Replacing List Section) */
        <div className="bg-white rounded-3xl p-6 sm:p-10 shadow-sm border border-slate-200/80 animate-in fade-in duration-200">
          {/* Top Bar with 'Back to Guidance' & Action Buttons */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 mb-6">
            <button
              onClick={() => {
                setReadingPost(null);
                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-800 hover:text-slate-950 text-xs font-bold transition-all cursor-pointer group w-fit"
            >
              <ArrowLeft className="w-4 h-4 text-slate-600 group-hover:-translate-x-0.5 transition-transform" />
              <span>Back to Guidance</span>
            </button>

            <div className="flex items-center gap-2 self-end sm:self-center">
              <button
                onClick={() => handleOpenEdit(readingPost)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-bold border border-slate-200 transition-colors cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5" />
                <span>Edit</span>
              </button>
              <button
                onClick={() => handleDeleteBlog(readingPost.id)}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Document Header */}
          <div className="space-y-3 pb-6 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-bold px-3 py-1 rounded-full bg-blue-100 text-blue-800">
                {readingPost.category}
              </span>
              <span className="text-xs text-slate-400 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {new Date(readingPost.createdAt).toLocaleDateString()}
              </span>
            </div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black text-slate-900 tracking-tight leading-tight">
              {readingPost.title}
            </h1>
          </div>

          {/* Author Bar, Views, Likes */}
          <div className="py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 text-xs">
            <div className="flex items-center gap-3">
              {(() => {
                const avatarUrl = getAuthorAvatar(readingPost.author, user, allUsers);
                return avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={readingPost.author.name}
                    className="w-10 h-10 rounded-full object-cover shrink-0 ring-2 ring-slate-100"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-blue-600 text-white font-extrabold text-xs flex items-center justify-center uppercase shrink-0">
                    {getInitials(readingPost.author.name)}
                  </div>
                );
              })()}
              <div>
                <p className="font-bold text-slate-900 text-sm">{readingPost.author.name}</p>
                <p className="text-xs text-slate-400">{readingPost.author.role}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 text-slate-400">
              <span className="flex items-center gap-1 text-xs">
                <Eye className="w-4 h-4" />
                {readingPost.views} views
              </span>
              <button
                onClick={(e) => handleLike(readingPost.id, e)}
                className="flex items-center gap-1 text-xs text-slate-600 hover:text-rose-500 transition-colors cursor-pointer"
              >
                <Heart className="w-4 h-4 fill-rose-50 text-rose-500 hover:fill-rose-500" />
                <span>{readingPost.likes}</span>
              </button>
            </div>
          </div>

          {/* Document Content with Markdown Image & Text Parsing */}
          <div className="py-8 max-w-none text-xs sm:text-sm leading-relaxed text-slate-800">
            {renderMarkdownContent(readingPost.content)}
          </div>

          {/* Embedded PDF Viewer if any attachment is a PDF */}
          {(() => {
            const allAttachments: BlogAttachment[] = [
              ...(readingPost.attachments || []),
              ...(readingPost.attachment && !(readingPost.attachments || []).some((a) => a.url === readingPost.attachment?.url) ? [readingPost.attachment] : [])
            ];
            const pdfAttachment = allAttachments.find((a) => a.fileType === 'pdf' || a.name.toLowerCase().endsWith('.pdf'));
            if (!pdfAttachment) return null;

            return (
              <div className="mb-6 border border-slate-200 rounded-3xl overflow-hidden shadow-xs">
                <div className="bg-slate-50 px-4 py-2.5 border-b border-slate-200 text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-4 h-4 text-rose-500" />
                    PDF Document: {pdfAttachment.name}
                  </span>
                  <a
                    href={pdfAttachment.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-700 text-xs font-semibold flex items-center gap-1 underline"
                  >
                    Open in New Tab ↗
                  </a>
                </div>
                <iframe
                  src={pdfAttachment.url}
                  className="w-full h-[650px] bg-slate-100 border-none"
                  title={pdfAttachment.name}
                />
              </div>
            );
          })()}

          {/* Downloadable Attachments & Resources Section (At the bottom of the blog) */}
          {(() => {
            const allAttachments: BlogAttachment[] = [
              ...(readingPost.attachments || []),
              ...(readingPost.attachment && !(readingPost.attachments || []).some((a) => a.url === readingPost.attachment?.url) ? [readingPost.attachment] : [])
            ];
            if (allAttachments.length === 0) return null;

            return (
              <div className="mb-8 p-4 sm:p-5 rounded-2xl sm:rounded-3xl bg-slate-900 text-white border border-slate-800 shadow-md">
                <div className="flex items-center justify-between gap-3 mb-3 pb-2.5 border-b border-slate-800">
                  <div className="flex items-center gap-2">
                    <Paperclip className="w-4 h-4 text-blue-400" />
                    <span className="font-extrabold text-xs sm:text-sm text-white">
                      Downloadable Attachments & Resources
                    </span>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-blue-500/20 text-blue-300 border border-blue-500/30">
                      {allAttachments.length} {allAttachments.length === 1 ? 'Resource' : 'Resources'}
                    </span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-medium hidden sm:inline-block">
                    Click download to retrieve resource
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {allAttachments.map((att, idx) => {
                    const ext = att.name.split('.').pop()?.toLowerCase() || '';
                    const isPy = ext === 'py';
                    const isZip = ext === 'zip' || ext === 'tar' || ext === 'gz';
                    const isPdf = ext === 'pdf';
                    const isDoc = ext === 'doc' || ext === 'docx' || ext === 'ppt' || ext === 'pptx';

                    return (
                      <div
                        key={`att-item-${idx}`}
                        className="p-3 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/80 flex items-center justify-between gap-3 transition-colors group"
                      >
                        <div className="flex items-center gap-2.5 truncate">
                          <div
                            className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                              isPy
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : isZip
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : isPdf
                                ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                                : isDoc
                                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                                : 'bg-slate-700 text-slate-300'
                            }`}
                          >
                            {isPy ? (
                              <FileCode className="w-4 h-4" />
                            ) : isZip ? (
                              <Package className="w-4 h-4" />
                            ) : isPdf || isDoc ? (
                              <FileText className="w-4 h-4" />
                            ) : (
                              <Paperclip className="w-4 h-4" />
                            )}
                          </div>
                          <div className="truncate">
                            <span className="font-bold text-xs text-white block truncate group-hover:text-blue-300 transition-colors">
                              {att.name}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {ext ? `.${ext.toUpperCase()} • ` : ''}{att.sizeMB} MB
                            </span>
                          </div>
                        </div>

                        <a
                          href={att.url}
                          download={att.name}
                          className="px-3.5 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Download</span>
                        </a>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })()}

          {/* Footer tags & Back to Guidance button */}
          <div className="pt-6 border-t border-slate-100 flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap gap-1.5">
              {readingPost.tags.map((t, i) => (
                <span
                  key={i}
                  className="text-xs font-semibold px-3 py-1 rounded-full bg-slate-100 text-slate-600"
                >
                  #{t}
                </span>
              ))}
            </div>

            <button
              onClick={() => {
                setReadingPost(null);
                if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md transition-all cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back to Guidance</span>
            </button>
          </div>
        </div>
      ) : (
        /* GUIDANCE DOCS LIST VIEW (Filters + Cards Grid) */
        <>
          {/* Filter and Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Search guidance, SOPs, tags, keywords..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 rounded-xl text-xs border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Category Pills */}
            <div className="flex flex-wrap items-center gap-1.5 overflow-x-auto">
              {['all', 'Guidance', 'Hardware Setup', 'Software Setup', 'SOP'].map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat === 'all' ? 'All Docs' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Blog Cards Grid */}
          {filteredBlogs.length === 0 ? (
            <div className="bg-white rounded-3xl p-12 text-center border border-slate-100 shadow-sm">
              <BookOpen className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-base font-bold text-slate-800">No Guidance Documents Found</h3>
              <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                No documents matched your current search or category filter. Try clearing your filters or create a new document.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pagedBlogs.map((post) => {
                  const isDoc = Boolean(post.attachment);

                return (
                  <div
                    key={post.id}
                    onClick={() => openPost(post)}
                    className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 hover:shadow-md transition-all cursor-pointer flex flex-col justify-between group"
                  >
                    <div>
                      {/* Category & Date */}
                      <div className="flex items-center justify-between text-xs mb-3">
                        <span className="font-bold text-[11px] px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                          {post.category}
                        </span>
                        <span className="text-slate-400 text-[11px] flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {new Date(post.createdAt).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="font-extrabold text-base text-slate-900 group-hover:text-blue-600 transition-colors line-clamp-2">
                        {post.title}
                      </h3>

                      {/* Excerpt */}
                      <p className="text-xs text-slate-500 mt-2 line-clamp-3 leading-relaxed">
                        {cleanExcerpt(post.excerpt || post.content)}
                      </p>

                      {/* Card Image Thumbnail if post contains an image */}
                      {(() => {
                        const imgMatch = post.content?.match(/!\[([^\]]*)\]\(([^)]+)\)/);
                        if (imgMatch && imgMatch[2]) {
                          return (
                            <div className="mt-3 w-full h-36 rounded-xl overflow-hidden bg-slate-100 border border-slate-200/70 relative">
                              <img
                                src={imgMatch[2]}
                                alt={imgMatch[1] || post.title}
                                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                            </div>
                          );
                        }
                        return null;
                      })()}

                      {/* Attachment Pill if available */}
                      {(() => {
                        const allCardAtts: BlogAttachment[] = [
                          ...(post.attachments || []),
                          ...(post.attachment && !(post.attachments || []).some((a) => a.url === post.attachment?.url) ? [post.attachment] : [])
                        ];
                        if (allCardAtts.length === 0) return null;

                        const firstAtt = allCardAtts[0];
                        const ext = firstAtt.name.split('.').pop()?.toLowerCase() || '';
                        const isPy = ext === 'py';
                        const isPdf = ext === 'pdf';
                        const isWord = ext === 'doc' || ext === 'docx';
                        const isSlides = ext === 'ppt' || ext === 'pptx';
                        const isMd = ext === 'md' || ext === 'txt';
                        const isZip = ext === 'zip' || ext === 'tar' || ext === 'gz';

                        const pillColor = isPy
                          ? 'bg-blue-50/90 border-blue-200 text-blue-950'
                          : isPdf
                          ? 'bg-rose-50/80 border-rose-200 text-rose-950'
                          : isWord
                          ? 'bg-blue-50/80 border-blue-200 text-blue-950'
                          : isSlides
                          ? 'bg-amber-50/80 border-amber-200 text-amber-950'
                          : isZip
                          ? 'bg-purple-50/80 border-purple-200 text-purple-950'
                          : isMd
                          ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                          : 'bg-slate-50/90 border-slate-200 text-slate-800';

                        const btnColor = isPy
                          ? 'bg-blue-600 text-white hover:bg-blue-700'
                          : 'bg-slate-900 text-white hover:bg-slate-800';

                        return (
                          <div
                            onClick={(e) => e.stopPropagation()}
                            className={`mt-4 p-2.5 rounded-2xl border flex items-center justify-between gap-2 ${pillColor}`}
                          >
                            <div className="flex items-center gap-2 truncate">
                              {isPy ? (
                                <FileCode className="w-4 h-4 text-blue-600 shrink-0" />
                              ) : isZip ? (
                                <Package className="w-4 h-4 text-purple-600 shrink-0" />
                              ) : (
                                <Paperclip className="w-4 h-4 shrink-0 opacity-80" />
                              )}
                              <span className="text-xs font-bold truncate">
                                {firstAtt.name}
                                {allCardAtts.length > 1 ? ` (+${allCardAtts.length - 1} more)` : ''}
                              </span>
                            </div>
                            <a
                              href={firstAtt.url}
                              download={firstAtt.name}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold shrink-0 flex items-center gap-1 transition-colors ${btnColor}`}
                            >
                              <Download className="w-3 h-3" />
                              <span>{allCardAtts.length > 1 ? `${allCardAtts.length} files` : `${firstAtt.sizeMB} MB`}</span>
                            </a>
                          </div>
                        );
                      })()}

                      {/* Tags */}
                      {post.tags && post.tags.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-1">
                          {post.tags.map((t, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full"
                            >
                              #{t}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Author & Footer Actions */}
                    <div className="mt-6 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        {(() => {
                          const avatarUrl = getAuthorAvatar(post.author, user, allUsers);
                          return avatarUrl ? (
                            <img
                              src={avatarUrl}
                              alt={post.author.name}
                              className="w-6 h-6 rounded-full object-cover"
                            />
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-blue-600 text-white font-extrabold text-[10px] flex items-center justify-center uppercase">
                              {getInitials(post.author.name)}
                            </div>
                          );
                        })()}
                        <div>
                          <p className="font-bold text-slate-800 text-[11px] leading-tight">{post.author.name}</p>
                          <p className="text-[10px] text-slate-400">{post.author.role}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 text-slate-400">
                        <span className="flex items-center gap-1 text-[11px]">
                          <Eye className="w-3.5 h-3.5" />
                          {post.views}
                        </span>
                        <button
                          onClick={(e) => handleLike(post.id, e)}
                          className="flex items-center gap-1 text-[11px] hover:text-rose-500 transition-colors cursor-pointer"
                        >
                          <Heart className="w-3.5 h-3.5 fill-rose-50 hover:fill-rose-500" />
                          {post.likes}
                        </button>
                        <button
                          onClick={(e) => handleOpenEdit(post, e)}
                          title="Edit Document"
                          className="p-1 rounded-full hover:bg-blue-50 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={(e) => handleDeleteBlog(post.id, e)}
                          title="Delete Document"
                          className="p-1 rounded-full hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Pagination Navigation (Max 10 per page) */}
            {filteredBlogs.length > 0 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-6 border-t border-slate-100 text-xs mt-6">
                <span className="text-slate-400 font-medium">
                  Showing {(blogsPage - 1) * 10 + 1} - {Math.min(filteredBlogs.length, blogsPage * 10)} of {filteredBlogs.length} documents
                </span>
                <div className="flex items-center gap-2">
                  <button
                    disabled={blogsPage <= 1}
                    onClick={() => {
                      setBlogsPage((p) => Math.max(1, p - 1));
                      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="p-1.5 sm:p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-4 h-4 text-slate-700" />
                  </button>
                  <span className="font-extrabold text-slate-800 px-2 select-none">
                    {blogsPage} out of {blogsTotalPages}
                  </span>
                  <button
                    disabled={blogsPage >= blogsTotalPages}
                    onClick={() => {
                      setBlogsPage((p) => Math.min(blogsTotalPages, p + 1));
                      if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                    className="p-1.5 sm:p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-30 cursor-pointer shadow-xs transition-colors"
                    title="Next page"
                  >
                    <ChevronRight className="w-4 h-4 text-slate-700" />
                  </button>
                </div>
              </div>
            )}
          </>
          )}
        </>
      )}

      {/* CREATE / EDIT DOCUMENT / BLOG MODAL */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-3xl p-5 sm:p-8 max-w-2xl w-full max-h-[92vh] overflow-y-auto shadow-2xl border border-slate-100 animate-in fade-in zoom-in-95">
            <div className="flex items-start justify-between pb-3 border-b border-slate-100 mb-4 gap-2">
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-slate-900">
                  {editingBlogId ? 'Edit Guidance Document' : 'Add Guidance Documentation'}
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-0.5">
                  {editingBlogId
                    ? 'Modify article text, guidance SOPs, or attached imagery'
                    : 'Upload existing files or write custom markdown with drag & drop images'}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingBlogId(null);
                  setUploadedFile(null);
                  setAdditionalFiles([]);
                  setExistingAttachments([]);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 flex items-center justify-center text-slate-500 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Switch Mode: 'upload' vs 'write' */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-1.5 bg-slate-100 rounded-2xl mb-6">
              <button
                type="button"
                onClick={() => setCreationMode('upload')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  creationMode === 'upload'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UploadCloud className="w-4 h-4 text-blue-600 shrink-0" />
                <span className="truncate">Upload Word, PDF, or Slides</span>
              </button>

              <button
                type="button"
                onClick={() => setCreationMode('write')}
                className={`flex-1 py-2.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                  creationMode === 'write'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-4 h-4 text-amber-600 shrink-0" />
                <span className="truncate">Custom Blog & Drag-Drop Images</span>
              </button>
            </div>

            {/* MODE 1: FILE UPLOAD (Word, PDF, Slides, Markdown, Python, Attachments) */}
            {creationMode === 'upload' && (
              <form onSubmit={handleFileUploadSubmit} className="space-y-4">
                {/* Error Banner */}
                {docUploadError && (
                  <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 font-semibold flex items-center gap-2.5 animate-in fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span className="flex-1">{docUploadError}</span>
                    <button
                      type="button"
                      onClick={() => setDocUploadError(null)}
                      className="p-1 hover:bg-rose-100 rounded-lg text-rose-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                {/* File Dropzone */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-bold text-slate-700">
                      Select Document or Attachment (.py, .pdf, .docx, .pptx, .md, etc.) *
                    </label>
                    <span className="text-[10px] text-slate-400 font-medium">
                      Drag & drop file directly below
                    </span>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingDoc(true);
                    }}
                    onDragEnter={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingDoc(true);
                    }}
                    onDragLeave={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setIsDraggingDoc(false);
                    }}
                    onDrop={handleDocDrop}
                    onClick={() => {
                      document.getElementById('guidance-doc-file-input')?.click();
                    }}
                    className={`border-2 border-dashed rounded-2xl p-6 sm:p-8 flex flex-col items-center justify-center cursor-pointer transition-all text-center relative ${
                      isDraggingDoc
                        ? 'border-blue-500 bg-blue-50/70 ring-4 ring-blue-500/20 scale-[0.99]'
                        : uploadedFile
                        ? 'border-blue-300 bg-blue-50/20 hover:bg-blue-50/30'
                        : 'border-slate-200 hover:border-blue-400 hover:bg-slate-50/70'
                    }`}
                  >
                    <input
                      id="guidance-doc-file-input"
                      type="file"
                      accept="*"
                      className="hidden"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) {
                          const f = e.target.files[0];
                          setUploadedFile(f);
                          setDocUploadError(null);
                          if (!fileTitle) {
                            setFileTitle(f.name.replace(/\.[^/.]+$/, ''));
                          }
                        }
                      }}
                    />

                    {uploadedFile ? (
                      <div className="flex flex-col items-center justify-center space-y-2 pointer-events-none">
                        <div className="w-12 h-12 rounded-2xl bg-blue-100 text-blue-700 flex items-center justify-center shadow-xs">
                          <FileCheck className="w-6 h-6 text-blue-600" />
                        </div>
                        <div>
                          <span className="text-sm font-bold text-slate-900 block max-w-sm truncate">
                            {uploadedFile.name}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {(uploadedFile.size / (1024 * 1024)).toFixed(2)} MB • Ready to publish
                          </span>
                        </div>
                        <span className="text-[11px] font-semibold text-blue-600 underline">
                          Click or drop another file to replace
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center space-y-1.5 pointer-events-none">
                        <UploadCloud className={`w-10 h-10 ${isDraggingDoc ? 'text-blue-600 animate-bounce' : 'text-blue-500'} mb-1`} />
                        <span className="text-sm font-bold text-slate-800">
                          {isDraggingDoc ? 'Release to upload document' : 'Click to browse or drop file here'}
                        </span>
                        <span className="text-xs text-slate-400 max-w-sm">
                          Supports Python (.py), Word (.docx), PDF (.pdf), Slides (.pptx), Markdown (.md), or any other attachment
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Document Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. NVIDIA RTX 3060 CUDA Driver Setup SOP"
                    value={fileTitle}
                    onChange={(e) => setFileTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <select
                      value={fileCategory}
                      onChange={(e) => setFileCategory(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold"
                    >
                      <option value="Guidance">Guidance</option>
                      <option value="Hardware Setup">Hardware Setup</option>
                      <option value="Software Setup">Software Setup</option>
                      <option value="SOP">SOP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tags (comma separated)</label>
                    <input
                      type="text"
                      placeholder="CUDA, PyTorch, Setup"
                      value={fileTags}
                      onChange={(e) => setFileTags(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Brief Description</label>
                  <textarea
                    rows={2}
                    placeholder="Short summary of what this document covers..."
                    value={fileDescription}
                    onChange={(e) => setFileDescription(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  ></textarea>
                </div>

                {/* Additional Attachments */}
                {renderAttachmentPicker('extra-files-upload')}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setUploadedFile(null);
                      setAdditionalFiles([]);
                      setExistingAttachments([]);
                    }}
                    className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting || !uploadedFile}
                    className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer flex items-center gap-2"
                  >
                    {isSubmitting && <UploadCloud className="w-3.5 h-3.5 animate-bounce" />}
                    <span>{isSubmitting ? 'Publishing Document...' : 'Publish Document'}</span>
                  </button>
                </div>
              </form>
            )}

            {/* MODE 2: CUSTOM RICH BLOG WITH DRAG & DROP IMAGES */}
            {creationMode === 'write' && (
              <form onSubmit={handleCustomWriteSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Post Title</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Fine-Tuning YOLOv8 on Custom PCB Dataset"
                    value={postTitle}
                    onChange={(e) => setPostTitle(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 text-xs font-semibold"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Category</label>
                    <select
                      value={postCategory}
                      onChange={(e) => setPostCategory(e.target.value as any)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white font-semibold"
                    >
                      <option value="Guidance">Guidance</option>
                      <option value="Hardware Setup">Hardware Setup</option>
                      <option value="Software Setup">Software Setup</option>
                      <option value="SOP">SOP</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Tags (comma separated)</label>
                    <input
                      type="text"
                      placeholder="Vision, YOLOv8, Dataset"
                      value={postTags}
                      onChange={(e) => setPostTags(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                    />
                  </div>
                </div>

                {/* Editor with Image Drag-and-Drop Dropzone */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Content (Markdown Supported)
                    </label>
                    <span className="text-[11px] text-blue-600 font-semibold flex items-center gap-1">
                      <ImageIcon className="w-3.5 h-3.5" />
                      Drag & drop images anywhere into box below
                    </span>
                  </div>

                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDraggingImage(true);
                    }}
                    onDragLeave={() => setIsDraggingImage(false)}
                    onDrop={handleImageDrop}
                    className={`relative rounded-2xl border transition-all ${
                      isDraggingImage
                        ? 'border-blue-500 ring-4 ring-blue-500/20 bg-blue-50/30'
                        : 'border-slate-200'
                    }`}
                  >
                    {isDraggingImage && (
                      <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-blue-50/90 rounded-2xl backdrop-blur-xs">
                        <ImageIcon className="w-10 h-10 text-blue-600 animate-bounce mb-2" />
                        <p className="text-xs font-bold text-blue-800">
                          Drop image here to automatically upload & insert
                        </p>
                      </div>
                    )}

                    <textarea
                      ref={contentTextareaRef}
                      required
                      rows={9}
                      placeholder="Write your article or guide here...&#10;&#10;Drag and drop images directly into this area to embed them in your post!&#10;&#10;Markdown supported: # Headings, **bold**, `code`, etc."
                      value={postContent}
                      onChange={(e) => setPostContent(e.target.value)}
                      className="w-full p-3.5 rounded-2xl text-xs font-sans leading-relaxed focus:outline-none focus:ring-0 resize-y"
                    ></textarea>
                  </div>
                </div>

                {/* Additional Attachments */}
                {renderAttachmentPicker('extra-files-custom')}

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setShowCreateModal(false);
                      setEditingBlogId(null);
                      setUploadedFile(null);
                      setAdditionalFiles([]);
                      setExistingAttachments([]);
                    }}
                    className="px-4 py-2 rounded-full text-xs font-bold text-slate-600 hover:bg-slate-100"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-md shadow-blue-500/20"
                  >
                    {isSubmitting ? 'Saving...' : editingBlogId ? 'Save Changes' : 'Publish Post'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}


