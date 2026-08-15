import { ComponentFixture, TestBed } from '@angular/core/testing';

import { Establecimiento } from './establecimiento';

describe('Establecimiento', () => {
  let component: Establecimiento;
  let fixture: ComponentFixture<Establecimiento>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Establecimiento]
    })
    .compileComponents();

    fixture = TestBed.createComponent(Establecimiento);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
