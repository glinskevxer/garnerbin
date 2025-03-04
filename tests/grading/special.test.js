import { describe, expect, it } from 'vitest';
import {
  describeGrade,
  gradeSample,
  isInfested,
  millingEligible,
  sampleGradeReasons,
  specialGrades,
} from '../../src/grading/special.js';
import { SAMPLE_GRADE } from '../../src/grading/standards.js';

const wheat = {
  testWeight: 60.5,
  damagedTotal: 1,
  heatDamaged: 0.1,
  foreignMaterial: 0.3,
  shrunkenBroken: 2,
  defects: 2.5,
  wheatOtherClasses: 1,
  contrastingClasses: 0.5,
};

const corn = { testWeight: 57, damagedTotal: 2, heatDamaged: 0, bcfm: 1.5 };

describe('infestation', () => {
  it('takes two live weevils', () => {
    expect(isInfested({ liveWeevils: 2 })).toBe(true);
    expect(isInfested({ liveWeevils: 1 })).toBe(false);
  });

  it('takes one weevil in company', () => {
    expect(isInfested({ liveWeevils: 1, otherLiveInsects: 5 })).toBe(true);
    expect(isInfested({ liveWeevils: 1, otherLiveInsects: 4 })).toBe(false);
  });

  it('takes ten other live insects on their own', () => {
    expect(isInfested({ otherLiveInsects: 10 })).toBe(true);
    expect(isInfested({ otherLiveInsects: 9 })).toBe(false);
  });

  it('treats a sample with no counts as clean', () => {
    expect(isInfested({})).toBe(false);
  });
});

describe('wheat specials', () => {
  it('calls it ergoty over five hundredths of a percent', () => {
    expect(specialGrades('hrw', { ...wheat, ergotPercent: 0.06 })).toContain('ergoty');
    expect(specialGrades('hrw', { ...wheat, ergotPercent: 0.05 })).not.toContain('ergoty');
  });

  it('calls it garlicky at two bulblets', () => {
    expect(specialGrades('hrw', { ...wheat, garlicBulblets: 2 })).toContain('garlicky');
    expect(specialGrades('hrw', { ...wheat, garlicBulblets: 1 })).not.toContain('garlicky');
  });

  it('separates light smutty from smutty', () => {
    expect(specialGrades('hrw', { ...wheat, smutBalls: 5 })).toContain('light smutty');
    expect(specialGrades('hrw', { ...wheat, smutBalls: 30 })).toContain('light smutty');
    expect(specialGrades('hrw', { ...wheat, smutBalls: 31 })).toContain('smutty');
  });

  it('takes the odor on its own as light smutty', () => {
    expect(specialGrades('hrw', { ...wheat, smutOdor: true })).toContain('light smutty');
  });
});

describe('other commodity specials', () => {
  it('needs five bulblets in soybeans, not two', () => {
    const beans = { garlicBulblets: 4 };
    expect(specialGrades('soybeans', beans)).not.toContain('garlicky');
    expect(specialGrades('soybeans', { garlicBulblets: 5 })).toContain('garlicky');
  });

  it('flags purple mottled soybeans', () => {
    expect(specialGrades('soybeans', { purpleMottled: true })).toContain(
      'purple mottled or stained'
    );
  });

  it('flags smut coated milo', () => {
    expect(specialGrades('sorghum', { smutCoated: true })).toEqual(['smutty']);
  });

  it('flags treated grain in every commodity', () => {
    expect(specialGrades('corn', { treated: true })).toEqual(['treated']);
    expect(specialGrades('soybeans', { treated: true })).toEqual(['treated']);
  });
});

describe('sample grade conditions', () => {
  it('lists the reasons in words', () => {
    expect(sampleGradeReasons({ heating: true, musty: true })).toEqual([
      'the grain is heating',
      'a musty odor',
    ]);
    expect(sampleGradeReasons({})).toEqual([]);
  });

  it('overrides a perfectly good set of numbers', () => {
    const graded = gradeSample('corn', { ...corn, musty: true });
    expect(graded.numericGrade).toBe(1);
    expect(graded.grade).toBe(SAMPLE_GRADE);
    expect(graded.sampleGradeReasons).toEqual(['a musty odor']);
  });

  it('leaves a clean load alone', () => {
    const graded = gradeSample('corn', corn);
    expect(graded.grade).toBe(1);
    expect(graded.label).toBe('US No. 1');
    expect(graded.specialGrades).toEqual([]);
  });
});

describe('describing the whole grade', () => {
  it('hangs the specials off the numeric grade', () => {
    expect(describeGrade(2, ['ergoty'])).toBe('US No. 2, ergoty');
    expect(describeGrade(2)).toBe('US No. 2');
    expect(describeGrade(SAMPLE_GRADE, ['infested'])).toBe('US Sample grade, infested');
  });

  it('prints the specials on a graded sample', () => {
    const graded = gradeSample('hrw', { ...wheat, ergotPercent: 0.2, liveWeevils: 3 });
    expect(graded.grade).toBe(1);
    expect(graded.label).toBe('US No. 1, infested, ergoty');
  });
});

describe('milling eligibility', () => {
  it('turns down anything carrying a disqualifier', () => {
    expect(millingEligible('hrw', wheat)).toBe(true);
    expect(millingEligible('hrw', { ...wheat, ergotPercent: 0.2 })).toBe(false);
    expect(millingEligible('hrw', { ...wheat, treated: true })).toBe(false);
    expect(millingEligible('hrw', { ...wheat, liveWeevils: 4 })).toBe(false);
  });

  it('turns down sample grade whatever it is carrying', () => {
    expect(millingEligible('hrw', { ...wheat, heating: true })).toBe(false);
  });
});
