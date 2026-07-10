import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ConsultarRut } from './consultar-rut';

describe('ConsultarRut', () => {
  let component: ConsultarRut;
  let fixture: ComponentFixture<ConsultarRut>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsultarRut]
    })
    .compileComponents();

    fixture = TestBed.createComponent(ConsultarRut);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
