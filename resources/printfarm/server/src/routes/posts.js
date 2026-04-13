const express = require('express');
const { Post } = require('../db');
const { authenticate, requireAdmin } = require('../middleware/auth');

const router = express.Router();

// GET /api/posts?board=admin|user - List posts for a board
router.get('/', authenticate, async (req, res) => {
  try {
    const { board } = req.query;
    if (!board || !['admin', 'user'].includes(board)) {
      return res.status(400).json({ error: 'Valid board parameter is required (admin or user)' });
    }

    const posts = await Post.find({ board }).sort({ createdAt: -1 });
    res.json({ posts });
  } catch (err) {
    console.error('List posts error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/posts - Create post
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, content, board } = req.body;

    if (!title || !content || !board) {
      return res.status(400).json({ error: 'Title, content, and board are required' });
    }

    if (!['admin', 'user'].includes(board)) {
      return res.status(400).json({ error: 'Board must be admin or user' });
    }

    // Admin board requires admin/super_admin role
    if (board === 'admin' && req.user.role !== 'admin' && req.user.role !== 'super_admin' && req.user.role !== 'admin0') {
      return res.status(403).json({ error: 'Admin access required to post on admin board' });
    }

    const post = await Post.createNew({
      title,
      content,
      board,
      author: req.user.username,
      authorId: req.user.id || req.user.id || req.user._id,
    });
    res.status(201).json({ post: post.toJSON() });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/posts/:id - Edit post (author or admin/super_admin)
router.put('/:id', authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const isAuthor = post.authorId.toString() === req.user.id || req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    const { title, content } = req.body;
    if (title) post.title = title;
    if (content) post.content = content;
    await post.save();

    res.json({ post: post.toJSON() });
  } catch (err) {
    console.error('Edit post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/posts/:id - Delete post (author or admin/super_admin)
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const isAuthor = post.authorId.toString() === req.user.id || req.user._id.toString();
    const isAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    await Post.findByIdAndDelete(req.params.id);
    res.json({ message: 'Post deleted' });
  } catch (err) {
    console.error('Delete post error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
