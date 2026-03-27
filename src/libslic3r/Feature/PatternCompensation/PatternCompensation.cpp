#include "PatternCompensation.hpp"

#include "libslic3r/Point.hpp"
#include "libslic3r/Polygon.hpp"
#include "libslic3r/ExPolygon.hpp"

#include <cmath>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

namespace Slic3r::Feature::PatternCompensation {

// Compute the phase offset for a given layer height and pattern angle.
// angle_deg=90 (vertical): phase_offset=0 (teeth stay in same position)
// angle_deg=45: phase_offset=slice_z (teeth shift diagonally)
// angle_deg=0 (horizontal): large shift (teeth shift maximally per layer)
static double compute_phase_offset(coordf_t slice_z, double angle_deg)
{
    if (angle_deg >= 89.9)
        return 0.0;
    if (angle_deg <= 0.1)
        return slice_z * 1000.0;

    double angle_rad = angle_deg * M_PI / 180.0;
    return slice_z / tan(angle_rad);
}

// Compute the displacement amount at a given position along the perimeter.
// Returns the offset distance (in unscaled mm) based on the pattern type.
static double compute_displacement(double position_along_perimeter, double phase_offset, const PatternCompensationConfig& cfg)
{
    double tooth_width   = unscale_(cfg.tooth_width);
    double tooth_depth   = unscale_(cfg.tooth_depth);
    double tooth_spacing = unscale_(cfg.tooth_spacing);
    double period        = tooth_width + tooth_spacing;

    if (period < 1e-6)
        return 0.0;

    // Apply phase offset and wrap
    double pos = fmod(position_along_perimeter + phase_offset, period);
    if (pos < 0.0) pos += period;

    switch (cfg.type) {
    case PatternCompensationType::Square:
        return (pos < tooth_width) ? tooth_depth : 0.0;

    case PatternCompensationType::Sawtooth:
        if (pos < tooth_width)
            return tooth_depth * (pos / tooth_width);
        else
            return 0.0;

    case PatternCompensationType::Sine:
        if (pos < tooth_width)
            return tooth_depth * 0.5 * (1.0 - cos(2.0 * M_PI * pos / tooth_width));
        else
            return 0.0;

    default:
        return 0.0;
    }
}

// Apply pattern compensation to a polygon's points.
// Based on fuzzy_polyline() structure from FuzzySkin.
void pattern_compensation_polyline(Points& poly, bool closed, coordf_t slice_z, const PatternCompensationConfig& cfg)
{
    if (cfg.type == PatternCompensationType::None)
        return;

    // Point distance: subdivide enough for smooth/sharp pattern reproduction
    // Use 1/4 of the smaller of tooth_width or tooth_spacing for resolution
    double tooth_w = unscale_(cfg.tooth_width);
    double tooth_s = unscale_(cfg.tooth_spacing);
    double min_feature = std::min(tooth_w, tooth_s > 0.01 ? tooth_s : tooth_w);
    double point_distance_mm = std::max(min_feature / 4.0, 0.05); // At least 0.05mm
    double point_distance = scale_(point_distance_mm);

    double phase_offset = compute_phase_offset(slice_z, cfg.angle_deg);

    double cumulative_dist = 0.0;
    Point* p0 = &poly.back();
    Points out;
    out.reserve(poly.size() * 4); // Expect more points after densification

    for (Point& p1 : poly)
    {
        if (!closed) {
            closed = true;
            p0 = &p1;
            continue;
        }

        Vec2d  p0p1      = (p1 - *p0).cast<double>();
        double p0p1_size = p0p1.norm();

        if (p0p1_size < 1e-6) {
            p0 = &p1;
            continue;
        }

        Vec2d  edge_normal = perp(p0p1).cast<double>().normalized();

        for (double dist = 0.0; dist < p0p1_size; dist += point_distance)
        {
            Point pa = *p0 + (p0p1 * (dist / p0p1_size)).cast<coord_t>();
            double pos_mm = unscale_(cumulative_dist + scale_(dist));
            double r = compute_displacement(pos_mm, phase_offset, cfg);

            // Displace point perpendicular to edge
            out.emplace_back(pa + (edge_normal * scale_(r)).cast<coord_t>());
        }

        cumulative_dist += scale_(p0p1_size);
        p0 = &p1;
    }

    // Ensure minimum polygon validity
    while (out.size() < 3) {
        size_t point_idx = poly.size() - 2;
        out.emplace_back(poly[point_idx]);
        if (point_idx == 0)
            break;
        --point_idx;
    }

    if (out.size() >= 3)
        poly = std::move(out);
}

// Apply pattern compensation to Arachne extrusion junctions.
// Based on fuzzy_extrusion_line() structure from FuzzySkin.
void pattern_compensation_extrusion_line(Arachne::ExtrusionJunctions& ext_lines, coordf_t slice_z, const PatternCompensationConfig& cfg, bool closed)
{
    if (cfg.type == PatternCompensationType::None)
        return;

    double tooth_w = unscale_(cfg.tooth_width);
    double tooth_s = unscale_(cfg.tooth_spacing);
    double min_feature = std::min(tooth_w, tooth_s > 0.01 ? tooth_s : tooth_w);
    double point_distance_mm = std::max(min_feature / 4.0, 0.05);
    double point_distance = scale_(point_distance_mm);

    double phase_offset = compute_phase_offset(slice_z, cfg.angle_deg);

    double cumulative_dist = 0.0;
    auto* p0 = &ext_lines.front();
    Arachne::ExtrusionJunctions out;
    out.reserve(ext_lines.size() * 4);

    for (auto& p1 : ext_lines) {
        if (closed) {
            if (p0->p == p1.p) {
                out.emplace_back(p1.p, p1.w, p1.perimeter_index);
                continue;
            }
        }

        Vec2d  p0p1      = (p1.p - p0->p).cast<double>();
        double p0p1_size = p0p1.norm();

        if (p0p1_size < 1e-6) {
            p0 = &p1;
            continue;
        }

        Vec2d  edge_normal = perp(p0p1).cast<double>().normalized();

        for (double dist = 0.0; dist < p0p1_size; dist += point_distance)
        {
            Point pa = p0->p + (p0p1 * (dist / p0p1_size)).cast<coord_t>();
            double pos_mm = unscale_(cumulative_dist + scale_(dist));
            double r = compute_displacement(pos_mm, phase_offset, cfg);

            out.emplace_back(pa + (edge_normal * scale_(r)).cast<coord_t>(), p1.w, p1.perimeter_index);
        }

        cumulative_dist += scale_(p0p1_size);
        p0 = &p1;
    }

    // Ensure minimum points
    while (out.size() < 3) {
        size_t point_idx = ext_lines.size() - 2;
        out.emplace_back(ext_lines[point_idx].p, ext_lines[point_idx].w, ext_lines[point_idx].perimeter_index);
        if (point_idx == 0)
            break;
        --point_idx;
    }

    // Ensure closed loop
    if (closed && !ext_lines.empty() && ext_lines.back().p == ext_lines.front().p) {
        if (!out.empty()) {
            out.front().p = out.back().p;
            out.front().w = out.back().w;
        }
    }

    if (out.size() >= 3)
        ext_lines = std::move(out);
}

bool should_apply_pattern_compensation(const PatternCompensationConfig& config, int layer_id, size_t loop_idx, bool is_contour)
{
    if (config.type == PatternCompensationType::None)
        return false;
    // Only apply to outermost contour (loop_idx == 0 and is_contour)
    if (!is_contour || loop_idx != 0)
        return false;
    // Skip first layer if not enabled
    if (!config.first_layer && layer_id <= 0)
        return false;
    return true;
}

Polygon apply_pattern_compensation(const Polygon& polygon, const PerimeterGenerator& perimeter_generator, size_t loop_idx, bool is_contour)
{
    if (!perimeter_generator.has_pattern_compensation)
        return polygon;

    if (!should_apply_pattern_compensation(perimeter_generator.pattern_compensation_config,
                                            perimeter_generator.layer_id, loop_idx, is_contour))
        return polygon;

    Polygon result = polygon;
    Points  pts    = result.points;
    pattern_compensation_polyline(pts, true, perimeter_generator.slice_z, perimeter_generator.pattern_compensation_config);
    result.points = std::move(pts);
    return result;
}

void apply_pattern_compensation(Arachne::ExtrusionLine* extrusion, const PerimeterGenerator& perimeter_generator, bool is_contour)
{
    if (!perimeter_generator.has_pattern_compensation)
        return;

    const bool is_external = extrusion->inset_idx == 0;
    if (!is_external)
        return;

    if (!should_apply_pattern_compensation(perimeter_generator.pattern_compensation_config,
                                            perimeter_generator.layer_id, extrusion->inset_idx, is_contour))
        return;

    pattern_compensation_extrusion_line(extrusion->junctions, perimeter_generator.slice_z,
                                         perimeter_generator.pattern_compensation_config);

    // Ensure the loop is closed
    if (!extrusion->junctions.empty() && extrusion->junctions.front().p != extrusion->junctions.back().p) {
        extrusion->junctions.back().p = extrusion->junctions.front().p;
        extrusion->junctions.back().w = extrusion->junctions.front().w;
    }
}

} // namespace Slic3r::Feature::PatternCompensation
