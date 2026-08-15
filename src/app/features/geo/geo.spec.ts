import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Geo } from './geo';

describe('Geo', () => {
  let component: Geo;
  let fixture: ComponentFixture<Geo>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Geo]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Geo);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
