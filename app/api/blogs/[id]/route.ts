import { NextResponse } from 'next/server';
import { dataStore } from '@/lib/data-store';

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const blogs = dataStore.getBlogs();
    const blog = blogs.find((b) => b.id === id);

    if (!blog) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    if (body.title) blog.title = body.title.trim();
    if (body.category) blog.category = body.category;
    if (body.tags) blog.tags = body.tags;
    if (body.content !== undefined) {
      blog.content = body.content;
      blog.excerpt = body.excerpt || body.content.slice(0, 160).replace(/[#*`]/g, '') + '...';
    }
    if ('attachment' in body) {
      blog.attachment = body.attachment;
      blog.hasAttachment = Boolean(body.attachment);
    }
    blog.updatedAt = new Date().toISOString();

    dataStore.saveBlogs(blogs);
    return NextResponse.json(blog);
  } catch (err) {
    return NextResponse.json({ error: 'Failed to update blog post' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params;
    const blogs = dataStore.getBlogs();
    const filtered = blogs.filter((b) => b.id !== id);

    if (filtered.length === blogs.length) {
      return NextResponse.json({ error: 'Blog not found' }, { status: 404 });
    }

    dataStore.saveBlogs(filtered);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: 'Failed to delete blog post' }, { status: 500 });
  }
}

