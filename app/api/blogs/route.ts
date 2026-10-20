import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';
import { BlogPost } from '@/lib/types';

export async function GET() {
  const blogs = dataStore.getBlogs();
  return NextResponse.json(blogs);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body.title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const newBlog: BlogPost = {
      id: `blog-${Date.now().toString(36)}`,
      title: body.title.trim(),
      excerpt: body.excerpt || body.content.slice(0, 160).replace(/[#*`]/g, '') + '...',
      content: body.content || '',
      category: body.category || 'Guidance',
      tags: body.tags || ['General'],
      author: body.author || {
        id: 'usr-1',
        name: 'Staff Engineer',
        avatar: '',
        role: 'AI Specialist'
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      hasAttachment: Boolean(body.attachment || (body.attachments && body.attachments.length > 0)),
      attachment: body.attachment || (body.attachments && body.attachments[0]),
      attachments: body.attachments || (body.attachment ? [body.attachment] : []),
      coverImage: body.coverImage,
      views: 1,
      likes: 0
    };

    dataStore.addBlog(newBlog);
    return NextResponse.json(newBlog, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to create blog post' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const { id, action } = body;

    if (!id) {
      return NextResponse.json({ error: 'Blog ID is required' }, { status: 400 });
    }

    const blogs = dataStore.getBlogs();
    const blog = blogs.find((b) => b.id === id);
    if (!blog) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    if (action === 'like') {
      blog.likes += 1;
    } else if (action === 'view') {
      blog.views += 1;
    } else if (body.updates) {
      Object.assign(blog, body.updates, { updatedAt: new Date().toISOString() });
    }

    dataStore.saveBlogs(blogs);
    return NextResponse.json(blog);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update blog' }, { status: 500 });
  }
}

