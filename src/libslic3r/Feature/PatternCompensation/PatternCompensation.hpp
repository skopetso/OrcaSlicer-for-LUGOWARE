#ifndef libslic3r_PatternCompensation_hpp_
#define libslic3r_PatternCompensation_hpp_

#include "libslic3r/Arachne/utils/ExtrusionJunction.hpp"
#include "libslic3r/Arachne/utils/ExtrusionLine.hpp"
#include "libslic3r/PerimeterGenerator.hpp"

namespace Slic3r::Feature::PatternCompensation {

void pattern_compensation_polyline(Points& poly, bool closed, coordf_t slice_z, const PatternCompensationConfig& cfg);

void pattern_compensation_extrusion_line(Arachne::ExtrusionJunctions& ext_lines, coordf_t slice_z, const PatternCompensationConfig& cfg, bool closed = true);

bool should_apply_pattern_compensation(const PatternCompensationConfig& config, int layer_id, size_t loop_idx, bool is_contour);

Polygon apply_pattern_compensation(const Polygon& polygon, const PerimeterGenerator& perimeter_generator, size_t loop_idx, bool is_contour);
void    apply_pattern_compensation(Arachne::ExtrusionLine* extrusion, const PerimeterGenerator& perimeter_generator, bool is_contour);

} // namespace Slic3r::Feature::PatternCompensation

#endif // libslic3r_PatternCompensation_hpp_
