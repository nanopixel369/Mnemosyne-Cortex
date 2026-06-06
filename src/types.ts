// src/types.ts

export type LabCoordinate = [number, number, number]; // all integers

export interface HaltonEntry {
  index: number;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  base_mass: number;
  zone: 'core' | 'mid' | 'outer';
}

export interface SemanticAnchor {
  halton_index: number;
  tag_word: string;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  base_mass: number;
  zone: 'core' | 'mid' | 'outer';
  source: 'preset' | 'custom' | 'auto_discovered';
  created_at?: number;
  updated_at?: number;
}

export interface TagWithCount {
  tag: string;
  count: number;
}

export interface ChromaNode {
  id: number;
  lab_l: number;
  lab_a: number;
  lab_b: number;
  content: Buffer;
  tags_json: string;
  content_type?: string | null;
  content_hash?: string | null;
  strength: number;
  engagement_count: number;
  surfacing_count: number;
  state: 'decay' | 'neutral' | 'ascension' | 'permanence' | 'rot';
  last_engaged_at?: number | null;
  recent_engagement_sum: number;
  recent_surfacing_sum: number;
  created_at: number;
  updated_at: number;
}

export interface Breadcrumb {
  id: number;
  summary: string;
  tags: TagWithCount[];
  confidence: number;
  strength: number;
  engagement_ratio: number;
  state: string;
}

export interface FullResult extends ChromaNode {
  engagement_ratio: number;
}

export interface ChangeReport {
  entry_id: number;
  old_tags: TagWithCount[];
  new_tags: TagWithCount[];
  old_coordinates: LabCoordinate;
  new_coordinates: LabCoordinate;
  coordinate_changed: boolean;
}

export interface ChromaCoreConfig {
  core: {
    environment: 'development' | 'production';
    log_level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  };
  storage: {
    db_path: string;
    cache_size_mb: number;     // default 64
  };
  semantic_stack: {
    preset: string;
    knn_radius_default: number; // default 5.0
    frequency_nudging_scale: number; // default 1000.0
    fuzzy_matching_enabled: boolean; // default false
    fuzzy_distance: number;     // default 2
    custom_tag_threshold: number; // default 5
  };
  decay: {
    mode: 'none' | 'standard' | 'volatile';
    decay_to_rot_seconds?: number; // required if mode != 'none'
  };
  query: {
    default_k: number;          // default 10
    max_knn_radius: number;     // default 20.0
    confidence_threshold: number; // default 0.4
  };
}
