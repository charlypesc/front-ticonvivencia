import { ComponentFixture, TestBed } from '@angular/core/testing';

import { SubirDocumento } from './subir-documento';

describe('SubirDocumento', () => {
  let component: SubirDocumento;
  let fixture: ComponentFixture<SubirDocumento>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SubirDocumento]
    })
    .compileComponents();

    fixture = TestBed.createComponent(SubirDocumento);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
