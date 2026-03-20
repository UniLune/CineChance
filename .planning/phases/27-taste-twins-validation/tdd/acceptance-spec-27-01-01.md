## Acceptance Spec: Raise isSimilar threshold to 40%

### User Story
As a user viewing the 'Ваши близнецы вкуса' block, I want to see only people with truly similar taste (≥40% match), so that the recommendations are relevant and I don't waste time on low-quality matches.

### Scenarios
```gherkin
Scenario: Low match is not similar
  Given overallMatch = 0.35 (35%)
  When isSimilar() is called
  Then returns false

Scenario: Exactly threshold is considered similar
  Given overallMatch = 0.4 (40%)
  When isSimilar() is called
  Then returns true

Scenario: High match is similar
  Given overallMatch = 0.75 (75%)
  When isSimilar() is called
  Then returns true
```

### Edge Cases
- overallMatch = 0 (should be false)
- overallMatch = 1.0 (should be true)
- Negative overallMatch (should be false)

### Non-functional Requirements
- Constant MIN_MATCH_THRESHOLD should be exported for potential config
- Comment updated to reflect new threshold