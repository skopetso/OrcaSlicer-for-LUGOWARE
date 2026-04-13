const express = require('express');
const { Schedule } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/schedules — list (optional range filter)
router.get('/', authenticate, async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const filter = {};
    if (startDate && endDate) {
      filter.startDate = startDate;
      filter.endDate = endDate;
    }
    const schedules = await Schedule.find(filter);
    res.json(schedules.map(s => s.toJSON()));
  } catch (err) {
    console.error('[Schedules] GET error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/schedules — create
router.post('/', authenticate, async (req, res) => {
  try {
    const { title, description, startDate, endDate, color } = req.body;
    if (!title || !startDate || !endDate) {
      return res.status(400).json({ error: 'title, startDate, endDate required' });
    }
    const schedule = await Schedule.createNew({
      title,
      description,
      startDate,
      endDate,
      color,
      createdBy: req.user.username,
    });
    res.status(201).json(schedule.toJSON());
  } catch (err) {
    console.error('[Schedules] POST error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// PUT /api/schedules/:id — update
router.put('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });

    const { title, description, startDate, endDate, color } = req.body;
    if (title !== undefined) schedule.title = title;
    if (description !== undefined) schedule.description = description;
    if (startDate !== undefined) schedule.startDate = startDate;
    if (endDate !== undefined) schedule.endDate = endDate;
    if (color !== undefined) schedule.color = color;

    await schedule.save();
    res.json(schedule.toJSON());
  } catch (err) {
    console.error('[Schedules] PUT error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// DELETE /api/schedules/:id — delete
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const schedule = await Schedule.findByIdAndDelete(req.params.id);
    if (!schedule) return res.status(404).json({ error: 'Not found' });
    res.json({ message: 'Deleted' });
  } catch (err) {
    console.error('[Schedules] DELETE error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
