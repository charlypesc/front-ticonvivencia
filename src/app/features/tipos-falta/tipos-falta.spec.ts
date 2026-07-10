import { ComponentFixture, TestBed } from '@angular/core/testing';

import { TiposFalta } from './tipos-falta';

describe('TiposFalta', () => {
  let component: TiposFalta;
  let fixture: ComponentFixture<TiposFalta>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TiposFalta]
    })
    .compileComponents();

    fixture = TestBed.createComponent(TiposFalta);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
